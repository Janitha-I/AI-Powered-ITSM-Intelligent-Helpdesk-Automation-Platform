import os
from typing import Any

import httpx


class ServiceNowClient:
    def __init__(self) -> None:
        self.base_url = os.getenv("SERVICENOW_INSTANCE_URL", "").rstrip("/")
        self.username = os.getenv("SERVICENOW_USERNAME", "")
        self.password = os.getenv("SERVICENOW_PASSWORD", "")

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.username and self.password)

    async def _request(
        self,
        method: str,
        table: str,
        record_id: str | None = None,
        payload: dict[str, Any] | None = None,
        params: dict[str, str] | None = None,
    ) -> Any:
        if not self.configured:
            raise RuntimeError("ServiceNow credentials are not configured.")
        endpoint = f"{self.base_url}/api/now/table/{table}"
        if record_id:
            endpoint = f"{endpoint}/{record_id}"
        async with httpx.AsyncClient(timeout=15, auth=(self.username, self.password)) as client:
            response = await client.request(method, endpoint, json=payload, params=params, headers={"Accept": "application/json"})
            response.raise_for_status()
            body = response.json()
            return body.get("result", body)

    async def create_incident(self, ticket: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "incident", payload={
            "short_description": ticket["title"],
            "description": ticket["title"],
            "category": "network" if "network" in ticket["category"].lower() else "inquiry",
            "impact": "3",
            "urgency": "2" if ticket["priority"] == "P2" else "3",
            "priority": "2" if ticket["priority"] == "P2" else "3",
            "assignment_group": ticket["assigned_to"],
            "caller_id": ticket.get("requester", "Alex Morgan"),
        })

    async def create_request(self, request: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "sc_request", payload={
            "short_description": request["title"],
            "description": request.get("justification", "Software access request"),
            "requested_for": request.get("requester", "Alex Morgan"),
        })

    async def get_incident(self, record_id: str) -> dict[str, Any]:
        if record_id.startswith("INC"):
            records = await self._request("GET", "incident", params={"sysparm_query": f"number={record_id}", "sysparm_limit": "1"})
            if isinstance(records, list) and records:
                return records[0]
            raise LookupError("ServiceNow incident was not found.")
        return await self._request("GET", "incident", record_id=record_id)

    async def update_incident(self, record_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if "status" in updates:
            payload["state"] = {"Open": "1", "In progress": "2", "Resolved": "6", "Closed": "7"}.get(updates["status"], updates["status"])
        if "assigned_to" in updates:
            payload["assignment_group"] = updates["assigned_to"]
        if "title" in updates:
            payload["short_description"] = updates["title"]
        if record_id.startswith("INC"):
            records = await self._request("GET", "incident", params={"sysparm_query": f"number={record_id}", "sysparm_limit": "1"})
            if not isinstance(records, list) or not records:
                raise LookupError("ServiceNow incident was not found.")
            record_id = records[0]["sys_id"]
        return await self._request("PATCH", "incident", record_id=record_id, payload=payload)


servicenow = ServiceNowClient()
