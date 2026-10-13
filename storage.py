import os
from datetime import datetime, timezone
from typing import Any

from pymongo import MongoClient, ReplaceOne
from pymongo.errors import PyMongoError


class Store:
    def __init__(self) -> None:
        self.client = None
        self.db = None
        uri = os.getenv("MONGODB_URI")
        if uri:
            try:
                self.client = MongoClient(uri, serverSelectionTimeoutMS=1500)
                self.client.admin.command("ping")
                self.db = self.client[os.getenv("MONGODB_DATABASE", "sorim_itsm")]
            except PyMongoError:
                self.client = None
                self.db = None
        self.tickets: list[dict[str, Any]] = [
            {"id": "INC001842", "title": "VPN authentication failing", "requester": "Olivia Chen", "category": "Network / VPN", "priority": "P2", "status": "In progress", "assigned_to": "Network Support", "created": "09:42", "source": "Portal"},
            {"id": "INC001841", "title": "Outlook not syncing", "requester": "Marcus Hill", "category": "Email / Outlook", "priority": "P3", "status": "Resolved", "assigned_to": "Collaboration Support", "created": "09:18", "source": "Chatbot"},
            {"id": "REQ001245", "title": "Visual Studio Code installation", "requester": "Ava Robinson", "category": "Software / Access", "priority": "P3", "status": "Provisioning", "assigned_to": "Software Support", "created": "08:56", "source": "Portal"},
            {"id": "INC001840", "title": "Password expired", "requester": "Noah Patel", "category": "Account access", "priority": "P2", "status": "Resolved", "assigned_to": "Identity and Access Support", "created": "08:31", "source": "Chatbot"},
            {"id": "INC001839", "title": "Laptop running slowly", "requester": "Mia Thompson", "category": "Endpoint", "priority": "P3", "status": "Open", "assigned_to": "Endpoint Support", "created": "08:07", "source": "Email"},
        ]
        self.activity: list[dict[str, str]] = [
            {"label": "Password reset completed", "detail": "Noah Patel · automated", "time": "8 min ago", "kind": "success"},
            {"label": "VPN incident routed to Network Support", "detail": "Olivia Chen · INC001842", "time": "24 min ago", "kind": "route"},
            {"label": "Visual Studio Code request submitted", "detail": "Ava Robinson · REQ001245", "time": "51 min ago", "kind": "request"},
            {"label": "Outlook sync issue resolved", "detail": "Marcus Hill · knowledge assist", "time": "1 hr ago", "kind": "success"},
        ]

    @property
    def connected(self) -> bool:
        return self.db is not None

    def list_tickets(self) -> list[dict[str, Any]]:
        if self.db is not None:
            try:
                records = list(self.db.tickets.find({}, {"_id": 0}).sort("created_at", -1).limit(50))
                if records:
                    return records
            except PyMongoError:
                pass
        return self.tickets

    def create_ticket(self, ticket: dict[str, Any]) -> dict[str, Any]:
        ticket["created_at"] = datetime.now(timezone.utc).isoformat()
        self.tickets.insert(0, ticket)
        if self.db is not None:
            try:
                self.db.tickets.insert_one(ticket.copy())
            except PyMongoError:
                pass
        return ticket

    def update_ticket(self, ticket_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        for ticket in self.tickets:
            if ticket["id"] == ticket_id:
                ticket.update(updates)
                if self.db is not None:
                    try:
                        self.db.tickets.update_one({"id": ticket_id}, {"$set": updates})
                    except PyMongoError:
                        pass
                return ticket
        return None

    def record_activity(self, activity: dict[str, str]) -> None:
        self.activity.insert(0, activity)
        self.activity[:] = self.activity[:12]
        if self.db is not None:
            try:
                self.db.audit_logs.insert_one({**activity, "created_at": datetime.now(timezone.utc).isoformat()})
            except PyMongoError:
                pass

    def index_knowledge(self, documents: list[dict[str, Any]], embeddings: list[list[float]]) -> None:
        if self.db is None:
            return
        try:
            self.db.knowledge.bulk_write([
                ReplaceOne({"id": document["id"]}, {**document, "embedding": embedding}, upsert=True)
                for document, embedding in zip(documents, embeddings)
            ])
        except PyMongoError:
            pass

    def search_knowledge_vectors(self, embedding: list[float], limit: int = 3) -> list[dict[str, Any]] | None:
        if self.db is None:
            return None
        try:
            return list(self.db.knowledge.aggregate([
                {"$vectorSearch": {
                    "index": os.getenv("MONGODB_VECTOR_INDEX", "knowledge_vector_index"),
                    "path": "embedding",
                    "queryVector": embedding,
                    "numCandidates": max(30, limit * 10),
                    "limit": limit,
                }},
                {"$project": {"_id": 0, "embedding": 0, "score": {"$meta": "vectorSearchScore"}}},
            ]))
        except PyMongoError:
            return None


store = Store()
