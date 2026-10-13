# SORIM.Ai ITSM Helpdesk

A local-first prototype of an AI-assisted enterprise helpdesk. It demonstrates intelligent ticket intake, grounded knowledge search, safe first-line automation, an employee chatbot, and software provisioning. Integrations are optional: without credentials the app uses seeded tickets and a local vector index, so the workflows can be demoed offline.

## Requirements

- Python 3.10 or newer
- Node.js 20.19+ or 22.12+ (includes npm; required by current Vite)
- Optional: MongoDB Atlas connection string, Hugging Face inference token, and a ServiceNow developer instance

## Run locally on Windows

Open two PowerShell terminals in the project folder.

Terminal 1, start the API:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
Copy-Item .env.example backend\.env
uvicorn backend.app.main:app --reload --port 8000
```

Terminal 2, start the React app:

```powershell
npm install
npm run dev
```

Open the Vite URL (normally http://localhost:5173). The API docs are at http://localhost:8000/docs.

If PowerShell blocks virtual-environment activation, use `.venv\Scripts\python.exe -m pip install -r backend\requirements.txt` and `.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8000`.

## Optional integrations

Set these values in `backend/.env`. Keep credentials out of source control.

- `MONGODB_URI`: Atlas connection string. Tickets and audit events persist to MongoDB; without it the API uses in-memory demo records. Set `MONGODB_DATABASE` to override the default database name.
- `HUGGINGFACE_API_TOKEN`: Hugging Face token with inference access. Set `HUGGINGFACE_MODEL` for generation and `HUGGINGFACE_EMBEDDING_MODEL` for embeddings (default: `sentence-transformers/all-MiniLM-L6-v2`). Without it, answers use approved local articles and explicitly fall back to escalation when retrieval is weak.
- `SERVICENOW_INSTANCE_URL`, `SERVICENOW_USERNAME`, `SERVICENOW_PASSWORD`: ServiceNow instance and REST credentials. Configured incident intake and software requests create Table API records; incident GET and PATCH routes also proxy to ServiceNow. Without all three values, these workflows use the mock store.

When Atlas and a Hugging Face token are configured, the API embeds the approved articles and queries with the selected sentence-transformer model, then uses Atlas Vector Search on the `knowledge` collection. Create a vector-search index named `knowledge_vector_index` using `backend/atlas-vector-index.json`. If either integration is unavailable, the demo uses a local cosine-similarity index. ServiceNow reference fields (users, assignment groups, catalog items), authentication scopes, approvals, and field mappings should be aligned with the target instance before live use. The sample does not run privileged endpoint actions: password changes and account unlocks only start a guided flow and require human identity verification.

## Prototype API

- `GET /api/health`, `GET /api/dashboard`, `GET /api/tickets`
- `POST /api/intake`, `POST /api/chat`, `GET /api/knowledge?query=...`
- `POST /api/automation/{password-reset|account-unlock|vpn-check|restart-app}`
- `POST /api/provision`
- `GET /api/servicenow/incidents/{incident_number}`, `PATCH /api/servicenow/incidents/{incident_number}`

The React console currently calls `http://localhost:8000/api`; set up a same-origin proxy before deploying.

## Tests

```powershell
python -m pip install -r backend\requirements-dev.txt
python -m pytest backend\tests -q
```
