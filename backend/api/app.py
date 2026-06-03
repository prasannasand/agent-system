"""
FastAPI app — exposes the agent over HTTP.
Endpoints:
  POST /runs          — create a new agent run (enqueues to Redis)
  GET  /runs/{id}     — get run status + execution trace
  GET  /runs/{id}/stream — SSE stream of live step updates
  GET  /runs          — list recent runs
"""

import os
import uuid
import time
import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from backend.db.mongo import runs_collection
from backend.worker.queue import enqueue_run

app = FastAPI(title="AgentOS API", version="1.0.0")

_dev_mode = os.getenv("DEV_MODE", "true").lower() == "true"
_allow_origins = ["*"] if _dev_mode else ["http://localhost:3000", "http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateRunRequest(BaseModel):
    goal: str
    model: str = "gpt-4o"


class StepResponse(BaseModel):
    name: str
    tool: str
    status: str
    duration_ms: int | None = None
    detail: dict = {}


class RunResponse(BaseModel):
    id: str
    goal: str
    status: str
    elapsed_ms: int | None = None
    tool_calls: int = 0
    tokens_used: int = 0
    plan: list[str] = []
    steps: list[StepResponse] = []
    created_at: float
    updated_at: float


# ── Transformers ──────────────────────────────────────────────────────────────

def _transform_step(step: dict) -> dict:
    """Map a MongoDB step document to the StepResponse shape."""
    detail: dict = {}
    if "args" in step:
        detail.update(step["args"])
    output = step.get("output")
    if isinstance(output, dict):
        detail.update(output)
    elif output is not None:
        detail["output"] = str(output)

    duration = step.get("duration")
    return {
        "name": step.get("name", ""),
        "tool": step.get("tool", ""),
        "status": step.get("state", "pending"),          # DB: "state" → API: "status"
        "duration_ms": int(duration * 1000) if duration is not None else None,
        "detail": detail,
    }


def _transform_run(doc: dict) -> dict:
    """Map a MongoDB run document to the RunResponse shape."""
    print(f"[transform_run] run_id={doc.get('run_id')} status={doc.get('status')} tokens_used={doc.get('tokens_used')} elapsed_ms={doc.get('elapsed_ms')} steps={len(doc.get('steps', []))}")
    steps = [_transform_step(s) for s in doc.get("steps", [])]
    # Read elapsed_ms directly; fall back to converting legacy "elapsed" (float s) for old docs
    elapsed_ms = doc.get("elapsed_ms")
    if elapsed_ms is None and doc.get("elapsed") is not None:
        elapsed_ms = int(doc["elapsed"] * 1000)
    tool_calls = sum(1 for s in steps if s["tool"] != "llm")
    return {
        "id": doc["run_id"],                             # DB: "run_id" → API: "id"
        "goal": doc.get("goal", ""),
        "status": doc.get("status", "queued"),
        "elapsed_ms": elapsed_ms,
        "tool_calls": tool_calls,
        "tokens_used": doc.get("tokens_used", 0),
        "plan": doc.get("plan", []),
        "steps": steps,
        "created_at": doc.get("created_at", 0.0),
        "updated_at": doc.get("updated_at", 0.0),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/runs", response_model=RunResponse, status_code=202)
async def create_run(body: CreateRunRequest):
    run_id = str(uuid.uuid4())
    doc = {
        "run_id": run_id,
        "goal": body.goal,
        "model": body.model,
        "status": "queued",
        "steps": [],
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    runs_collection.insert_one(doc)
    enqueue_run(run_id, body.goal, body.model)
    doc.pop("_id", None)
    return _transform_run(doc)


@app.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(run_id: str):
    doc = runs_collection.find_one({"run_id": run_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Run not found")
    return _transform_run(doc)


@app.get("/runs")
async def list_runs(limit: int = 20, status: str | None = None):
    query = {"status": status} if status else {}
    docs = list(
        runs_collection.find(query, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
    return [_transform_run(doc) for doc in docs]


@app.delete("/runs/{run_id}")
async def delete_run(run_id: str):
    result = runs_collection.delete_one({"run_id": run_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"deleted": True}


@app.get("/runs/{run_id}/stream")
async def stream_run(run_id: str):
    """Server-Sent Events — push step updates to the React dashboard in real time."""
    async def event_generator():
        last_step_count = 0
        for _ in range(300):  # max 5 min
            doc = runs_collection.find_one({"run_id": run_id}, {"_id": 0})
            if not doc:
                yield f"event: error\ndata: {json.dumps({'error': 'not found'})}\n\n"
                return

            steps = doc.get("steps", [])
            if len(steps) > last_step_count:
                for step in steps[last_step_count:]:
                    yield f"event: step\ndata: {json.dumps(_transform_step(step))}\n\n"
                last_step_count = len(steps)

            if doc["status"] in ("done", "failed"):
                elapsed_ms = doc.get("elapsed_ms")
                if elapsed_ms is None and doc.get("elapsed") is not None:
                    elapsed_ms = int(doc["elapsed"] * 1000)
                payload = {"status": doc["status"], "elapsed_ms": elapsed_ms}
                yield f"event: complete\ndata: {json.dumps(payload)}\n\n"
                return

            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/health")
async def health():
    return {"status": "ok", "time": time.time()}
