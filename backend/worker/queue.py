"""
Redis queue + worker process.
- enqueue_run()  — called by the API to add a job
- Worker loop    — run this as a separate process: python -m backend.worker.queue
"""

import json
import time
import logging
import os
import redis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
QUEUE_KEY = "agent:queue"
MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT_RUNS", "10"))

_redis = redis.from_url(REDIS_URL, decode_responses=True)


def enqueue_run(run_id: str, goal: str, model: str = "gpt-4o") -> None:
    payload = json.dumps({"run_id": run_id, "goal": goal, "model": model})
    _redis.rpush(QUEUE_KEY, payload)
    logger.info("Enqueued run %s", run_id)


def dequeue_run(timeout: int = 5) -> dict | None:
    result = _redis.blpop(QUEUE_KEY, timeout=timeout)
    if result:
        _, payload = result
        return json.loads(payload)
    return None


def worker_loop():
    """Blocking worker — processes one job at a time from the Redis queue."""
    from backend.agent.agent import AgentRun

    logger.info("Worker started, listening on %s", QUEUE_KEY)
    while True:
        job = dequeue_run(timeout=5)
        if not job:
            continue
        run_id = job["run_id"]
        logger.info("Processing run %s | goal: %s", run_id, job["goal"][:60])
        try:
            result = AgentRun(run_id, job["goal"]).run()
            logger.info("Run %s finished: %s in %.1fs", run_id, result["status"], result.get("elapsed", 0))
        except Exception:
            logger.exception("Unhandled error in run %s", run_id)


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                        format="%(asctime)s %(levelname)s %(name)s — %(message)s")

    n_workers = int(os.getenv("WORKER_COUNT", "3"))
    if n_workers == 1:
        worker_loop()
    else:
        import multiprocessing
        procs = [multiprocessing.Process(target=worker_loop) for _ in range(n_workers)]
        for p in procs:
            p.start()
        logger.info("Started %d worker processes", n_workers)
        for p in procs:
            p.join()
