"""
Core autonomous agent — decomposes goals into subtasks and
orchestrates tool calls via OpenAI function calling.
"""

import json
import time
import logging
from typing import Any
from openai import OpenAI
from backend.agent.tools import TOOL_REGISTRY, TOOL_SCHEMAS
from backend.db.mongo import runs_collection

logger = logging.getLogger(__name__)
client = OpenAI()  # reads OPENAI_API_KEY from env


class AgentRun:
    def __init__(self, run_id: str, goal: str):
        self.run_id = run_id
        self.goal = goal
        self.steps: list[dict] = []
        self.total_tokens: int = 0
        self.messages: list[dict] = [
            {
                "role": "system",
                "content": (
                    "You are an autonomous AI agent. Given a high-level goal, "
                    "decompose it into subtasks and use the available tools to complete it. "
                    "Think step by step. After each tool result, decide whether the goal is "
                    "complete or if more steps are needed. When done, call finish_run."
                ),
            },
            {"role": "user", "content": f"Goal: {goal}"},
        ]

    def _plan(self) -> list[str]:
        plan_start = time.time()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        'You are a planning agent. Given a goal, output a numbered execution plan '
                        'as a JSON array of strings. Example: ["Search for X", "Analyze Y", "Compare Z"]. '
                        'Output ONLY valid JSON, nothing else.'
                    ),
                },
                {"role": "user", "content": f"Goal: {self.goal}"},
            ],
        )
        usage = response.usage
        self.total_tokens += usage.prompt_tokens + usage.completion_tokens
        print(f"[tokens] run={self.run_id} plan prompt={usage.prompt_tokens} completion={usage.completion_tokens} running_total={self.total_tokens}")

        try:
            plan_steps: list[str] = json.loads(response.choices[0].message.content)
        except (json.JSONDecodeError, TypeError):
            plan_steps = [response.choices[0].message.content or "Execute goal"]

        step = {
            "name": "Planning",
            "tool": "llm",
            "state": "done",
            "duration": round(time.time() - plan_start, 3),
            "output": {"plan": plan_steps},
        }
        self.steps.append(step)
        self._persist_step(step)
        runs_collection.update_one(
            {"run_id": self.run_id},
            {"$set": {"plan": plan_steps, "status": "planning"}},
        )
        return plan_steps

    def run(self) -> dict:
        start = time.time()
        self._update_status("running")

        plan_steps = self._plan()
        self.messages.append({
            "role": "system",
            "content": f"Your execution plan: {plan_steps}. Follow this plan.",
        })

        try:
            for _ in range(20):  # max 20 iterations (safety limit)
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=self.messages,
                    tools=TOOL_SCHEMAS,
                    tool_choice="auto",
                )
                usage = response.usage
                print(f"[tokens] run={self.run_id} prompt={usage.prompt_tokens} completion={usage.completion_tokens} running_total={self.total_tokens + usage.prompt_tokens + usage.completion_tokens}")
                self.total_tokens += usage.prompt_tokens + usage.completion_tokens
                msg = response.choices[0].message
                self.messages.append(msg)

                if not msg.tool_calls:
                    # No tool call = agent is done thinking, log final text
                    self._add_step("Final answer", "llm", "done", msg.content or "")
                    break

                for tc in msg.tool_calls:
                    name = tc.function.name
                    args = json.loads(tc.function.arguments)

                    if name == "finish_run":
                        self._add_step("Final answer", "llm", "done",
                                       args.get("summary", "Task completed."))
                        elapsed_ms = int((time.time() - start) * 1000)
                        self._update_status("done", elapsed_ms=elapsed_ms,
                                            result=args.get("summary"),
                                            tokens_used=self.total_tokens)
                        return {"status": "done", "elapsed_ms": elapsed_ms, "steps": self.steps}

                    step = self._execute_tool(name, args, tc.id)
                    self.messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(step["output"]),
                    })

        except Exception as e:
            logger.exception("Agent run %s failed", self.run_id)
            elapsed_ms = int((time.time() - start) * 1000)
            self._update_status("failed", elapsed_ms=elapsed_ms, error=str(e),
                                tokens_used=self.total_tokens)
            return {"status": "failed", "elapsed_ms": elapsed_ms, "error": str(e), "steps": self.steps}

        elapsed_ms = int((time.time() - start) * 1000)
        self._update_status("done", elapsed_ms=elapsed_ms, tokens_used=self.total_tokens)
        return {"status": "done", "elapsed_ms": elapsed_ms, "steps": self.steps}

    def _execute_tool(self, name: str, args: dict, call_id: str) -> dict:
        tool_fn = TOOL_REGISTRY.get(name)
        start = time.time()
        try:
            output = tool_fn(**args) if tool_fn else {"error": f"Unknown tool: {name}"}
            state = "done"
        except Exception as e:
            output = {"error": str(e)}
            state = "failed"

        step = {
            "name": name,
            "tool": _tool_category(name),
            "args": args,
            "output": output,
            "state": state,
            "duration": round(time.time() - start, 3),
            "call_id": call_id,
        }
        self.steps.append(step)
        self._persist_step(step)
        return step

    def _add_step(self, name: str, tool: str, state: str, output: Any):
        step = {"name": name, "tool": tool, "state": state, "output": output}
        self.steps.append(step)
        self._persist_step(step)

    def _persist_step(self, step: dict):
        runs_collection.update_one(
            {"run_id": self.run_id},
            {"$push": {"steps": step}, "$set": {"updated_at": time.time()}},
        )

    def _update_status(self, status: str, **kwargs):
        runs_collection.update_one(
            {"run_id": self.run_id},
            {"$set": {"status": status, "updated_at": time.time(), **kwargs}},
        )


def _tool_category(name: str) -> str:
    if "search" in name or "web" in name:
        return "web"
    if "code" in name or "exec" in name or "run" in name:
        return "code"
    if "api" in name or "http" in name or "db" in name:
        return "api"
    return "llm"
