from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_health_uses_local_integrations_without_credentials(monkeypatch):
    monkeypatch.delenv("HUGGINGFACE_API_TOKEN", raising=False)
    status = client.get("/api/health").json()
    assert status["status"] == "ok"
    assert status["database"] in ("MongoDB Atlas", "local demo store")
    assert status["ai"] == "grounded fallback"
    assert status["servicenow"] == "mock"


def test_intake_classifies_and_creates_a_ticket(monkeypatch):
    monkeypatch.delenv("HUGGINGFACE_API_TOKEN", raising=False)
    response = client.post("/api/intake", json={"message": "I cannot connect to VPN since this morning"})
    assert response.status_code == 200
    body = response.json()
    assert body["classification"]["intent"] == "Incident"
    assert body["classification"]["assignment_group"] == "Network Support"
    assert body["ticket"]["id"].startswith("INC")
    assert body["sources"][0]["id"] == "KB-101"


def test_chat_returns_grounded_source_without_model_token(monkeypatch):
    monkeypatch.delenv("HUGGINGFACE_API_TOKEN", raising=False)
    response = client.post("/api/chat", json={"message": "How do I reset my expired password?"})
    assert response.status_code == 200
    assert "password reset portal" in response.json()["answer"]
    assert response.json()["sources"][0]["id"] == "KB-102"


def test_demo_incident_can_be_read_and_updated():
    incident = client.get("/api/servicenow/incidents/INC001842")
    assert incident.status_code == 200
    updated = client.patch("/api/servicenow/incidents/INC001842", json={"status": "Resolved"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "Resolved"


def test_sensitive_automation_requires_human_verification():
    response = client.post("/api/automation/password-reset", json={"message": "reset password"})
    assert response.status_code == 200
    assert response.json()["requires_human"] is True
    assert "identity" in response.json()["result"].lower()


def test_software_request_is_created_in_demo_mode(monkeypatch):
    from backend.app.main import servicenow

    monkeypatch.setattr(servicenow, "base_url", "")
    monkeypatch.setattr(servicenow, "username", "")
    monkeypatch.setattr(servicenow, "password", "")
    response = client.post("/api/provision", json={"software": "Visual Studio Code"})
    assert response.status_code == 200
    assert response.json()["mock"] is True
    assert response.json()["request"]["category"] == "Software / Access"
    assert response.json()["request"]["id"].startswith("REQ")
