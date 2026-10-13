import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .services import KNOWLEDGE, classify_request, dense_embedding, generate_grounded_answer, huggingface_embedding, vector_index
from .servicenow import servicenow
from .storage import store

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
app = FastAPI(title="SORIM.Ai ITSM Helpdesk API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


class TextRequest(BaseModel):
    message: str = Field(min_length=3, max_length=2000)
    requester: str = "Alex Morgan"


class ProvisionRequest(BaseModel):
    software: str = Field(min_length=2, max_length=120)
    requester: str = "Alex Morgan"
    justification: str = ""


class IncidentUpdate(BaseModel):
    status: str | None = None
    assigned_to: str | None = None
    title: str | None = None


def serializable_ticket(ticket: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in ticket.items() if key != "created_at"}


_atlas_indexed = False
_atlas_uses_model_embeddings = False


async def retrieve_knowledge(query: str, limit: int = 3) -> list[dict[str, Any]]:
    global _atlas_indexed, _atlas_uses_model_embeddings
    if store.connected:
        documents = [f"{doc['title']} {doc['category']} {' '.join(doc['tags'])} {doc['content']}" for doc in KNOWLEDGE]
        if not _atlas_indexed:
            model_embeddings = await asyncio.gather(*(huggingface_embedding(text) for text in documents)) if os.getenv("HUGGINGFACE_API_TOKEN") else []
            if model_embeddings and all(embedding is not None for embedding in model_embeddings):
                embeddings = model_embeddings
                _atlas_uses_model_embeddings = True
            else:
                embeddings = [dense_embedding(text) for text in documents]
            store.index_knowledge(KNOWLEDGE, embeddings)
            _atlas_indexed = True
        query_embedding = await huggingface_embedding(query) if _atlas_uses_model_embeddings else dense_embedding(query)
        if query_embedding:
            atlas_results = store.search_knowledge_vectors(query_embedding, limit)
        else:
            atlas_results = None
        if atlas_results:
            return [{**result, "score": round(float(result.get("score", 0)), 3)} for result in atlas_results]
    return vector_index.search(query, limit)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "database": "MongoDB Atlas" if store.connected else "local demo store", "ai": "Hugging Face" if os.getenv("HUGGINGFACE_API_TOKEN") else "grounded fallback", "servicenow": "connected" if servicenow.configured else "mock"}


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    tickets = store.list_tickets()
    return {"metrics": {"open_tickets": sum(ticket["status"] not in ("Resolved", "Closed") for ticket in tickets), "resolved_today": 28, "automation_rate": 74, "avg_resolution": "18m"}, "tickets": [serializable_ticket(ticket) for ticket in tickets[:8]], "activity": store.activity}


@app.get("/api/tickets")
def tickets() -> list[dict[str, Any]]:
    return [serializable_ticket(ticket) for ticket in store.list_tickets()]


@app.get("/api/knowledge")
async def knowledge(query: str = "", limit: int = 10) -> list[dict[str, Any]]:
    return await retrieve_knowledge(query, max(1, min(limit, 20))) if query else KNOWLEDGE


@app.post("/api/intake")
async def intake(request: TextRequest) -> dict[str, Any]:
    details = classify_request(request.message)
    matches = await retrieve_knowledge(request.message)
    answer, model = await generate_grounded_answer(request.message, matches)
    ticket_id = f"INC{uuid4().hex[:6].upper()}"
    ticket = {"id": ticket_id, "title": request.message[:72], "requester": request.requester, "category": details["category"], "priority": details["priority"], "status": "Open", "assigned_to": details["assignment_group"], "created": datetime.now().strftime("%H:%M"), "source": "Self-service", **details}
    if servicenow.configured and details["intent"] == "Incident":
        try:
            remote = await servicenow.create_incident(ticket)
            ticket["id"] = remote.get("number", ticket_id)
            ticket["servicenow_sys_id"] = remote.get("sys_id")
        except Exception:
            ticket["integration_warning"] = "ServiceNow incident creation failed; saved in the local prototype store."
    ticket_id = ticket["id"]
    created = store.create_ticket(ticket)
    store.record_activity({"label": f"Ticket {ticket_id} created and classified", "detail": f"{request.requester} · {details['assignment_group']}", "time": "Just now", "kind": "route"})
    return {"ticket": serializable_ticket(created), "classification": details, "answer": answer, "model": model, "sources": matches}


@app.post("/api/chat")
async def chat(request: TextRequest) -> dict[str, Any]:
    matches = await retrieve_knowledge(request.message)
    answer, model = await generate_grounded_answer(request.message, matches)
    return {"answer": answer, "model": model, "sources": matches, "confidence": matches[0]["score"] if matches else 0}


@app.get("/api/servicenow/incidents/{incident_number}")
async def get_incident(incident_number: str) -> dict[str, Any]:
    if servicenow.configured:
        try:
            return await servicenow.get_incident(incident_number)
        except Exception as error:
            raise HTTPException(status_code=502, detail="ServiceNow could not retrieve this incident.") from error
    ticket = next((ticket for ticket in store.list_tickets() if ticket["id"] == incident_number), None)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Incident not found in the demo store.")
    return serializable_ticket(ticket)


@app.patch("/api/servicenow/incidents/{incident_number}")
async def update_incident(incident_number: str, request: IncidentUpdate) -> dict[str, Any]:
    updates = request.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Provide at least one incident field to update.")
    if servicenow.configured:
        try:
            return await servicenow.update_incident(incident_number, updates)
        except Exception as error:
            raise HTTPException(status_code=502, detail="ServiceNow could not update this incident.") from error
    ticket = store.update_ticket(incident_number, updates)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Incident not found in the demo store.")
    store.record_activity({"label": f"Incident {incident_number} updated", "detail": ", ".join(updates), "time": "Just now", "kind": "route"})
    return serializable_ticket(ticket)


@app.post("/api/automation/{action}")
def automate(action: str, request: TextRequest) -> dict[str, Any]:
    actions = {
        "password-reset": ("Password reset", "Identity and Access Support", "Approved reset flow started. The user must finish verification in the identity portal."),
        "account-unlock": ("Account unlock", "Identity and Access Support", "Account unlock request queued after identity verification."),
        "vpn-check": ("VPN diagnostics", "Network Support", "Device time, VPN profile, and connection checks recorded. No password or MFA code was collected."),
        "restart-app": ("Application restart", "Endpoint Support", "Restart instructions sent. Escalate if the issue persists."),
    }
    if action not in actions:
        raise HTTPException(status_code=404, detail="Automation is not available.")
    title, group, result = actions[action]
    audit = {"label": f"{title} automation completed", "detail": f"{request.requester} · {action}", "time": "Just now", "kind": "success"}
    store.record_activity(audit)
    return {"status": "completed", "action": action, "result": result, "audit": audit, "requires_human": action in ("password-reset", "account-unlock")}


@app.post("/api/provision")
async def provision(request: ProvisionRequest) -> dict[str, Any]:
    request_id = f"REQ{uuid4().hex[:6].upper()}"
    is_mock = not servicenow.configured
    result = {"id": request_id, "title": f"{request.software} installation", "requester": request.requester, "category": "Software / Access", "priority": "P3", "status": "Provisioning", "assigned_to": "Software Support", "created": datetime.now().strftime("%H:%M"), "source": "Self-service", "justification": request.justification, "servicenow": "mock request created" if is_mock else "request submitted"}
    if not is_mock:
        try:
            remote = await servicenow.create_request(result)
            result["id"] = remote.get("number", request_id)
            result["servicenow_sys_id"] = remote.get("sys_id")
            request_id = result["id"]
        except Exception:
            is_mock = True
            result["servicenow"] = "ServiceNow unavailable; mock request created"
    store.create_ticket(result)
    store.record_activity({"label": f"{request.software} request submitted", "detail": f"{request.requester} · {request_id}", "time": "Just now", "kind": "request"})
    return {"request": serializable_ticket(result), "mock": is_mock}
