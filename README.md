# Black Within

An intentional, culturally conscious dating experience — love guided by lineage.

## Monorepo Structure

- `apps/web` — Next.js web app (frontend)
- `apps/api` — FastAPI service (backend)

## Requirements (Local Development)

- Node.js (LTS recommended)
- Python 3.11+ (for the API)

## Run Frontend (Next.js)

```bash
cd apps/web
npm install
npm run dev
## Run API (FastAPI)

```bash
cd apps/api
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
