# Autonomous AI Agent System

A full-stack autonomous AI agent that accepts a high-level goal, breaks it down into subtasks, and executes them step-by-step using OpenAI function calling. Each run is persisted in MongoDB, streamed live to a React dashboard over SSE, and processed asynchronously through a Redis-backed worker queue — so you can fire off long-running research or automation tasks and watch them unfold in real time.

## Architecture

```
React Dashboard  →  FastAPI (port 8000)  →  Redis Queue  →  Worker(s)  →  OpenAI
                                         →  MongoDB (state)
```

## Quick start (Docker)

```bash
cp .env.example .env
# Fill in OPENAI_API_KEY in .env

docker compose up --build
```

- API: http://localhost:8000/docs
- Dashboard: http://localhost:3000

## Quick start (local dev)

```bash
# 1. Start Redis + Mongo
docker compose up redis mongo -d

# 2. Python env
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in keys

# 3. Start API
uvicorn backend.api.app:app --reload

# 4. Start worker (separate terminal)
python -m backend.worker.queue

# 5. Start frontend (separate terminal)
cd frontend && npm install && npm run dev
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | /runs | Create a new agent run |
| GET | /runs/{id} | Get run status + trace |
| GET | /runs/{id}/stream | SSE stream of live steps |
| GET | /runs | List recent runs |

### Create a run

```bash
curl -X POST http://localhost:8000/runs \
  -H "Content-Type: application/json" \
  -d '{"goal": "Research the top 5 open source LLMs in 2025"}'
```

## Scaling

Scale workers:
```bash
docker compose up --scale worker=10 -d
```

## Adding new tools

1. Add a function to `backend/agent/tools.py`
2. Add it to `TOOL_REGISTRY` and `TOOL_SCHEMAS`
3. That's it — the agent will start using it automatically

## Project structure

```
agent-system/
├── backend/
│   ├── agent/
│   │   ├── agent.py      # Core agent loop
│   │   └── tools.py      # Tool registry
│   ├── api/
│   │   └── app.py        # FastAPI routes
│   ├── worker/
│   │   └── queue.py      # Redis queue + worker
│   └── db/
│       └── mongo.py      # MongoDB connection
├── frontend/             # React dashboard
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── .env.example
```
