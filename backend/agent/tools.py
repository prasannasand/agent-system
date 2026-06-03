"""
Tool registry — all tools available to the agent.
Each tool is a plain Python function + its JSON schema for OpenAI function calling.
"""

import subprocess
import tempfile
import textwrap
import httpx

# ── Tool implementations ──────────────────────────────────────────────────────

def web_search(query: str, num_results: int = 5) -> dict:
    """Search the web. Uses Tavily if TAVILY_API_KEY is set, SerpAPI if SERPAPI_KEY is set."""
    import os, requests

    tavily_key = os.getenv("TAVILY_API_KEY")
    serpapi_key = os.getenv("SERPAPI_KEY")

    if tavily_key:
        resp = requests.post(
            "https://api.tavily.com/search",
            json={"query": query, "max_results": num_results, "api_key": tavily_key},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        return {"results": [{"title": r["title"], "url": r["url"], "snippet": r.get("content", "")} for r in results]}

    if serpapi_key:
        resp = requests.get(
            "https://serpapi.com/search",
            params={"q": query, "num": num_results, "api_key": serpapi_key},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json().get("organic_results", [])
        return {"results": [{"title": r["title"], "url": r["link"], "snippet": r.get("snippet", "")} for r in results]}

    raise RuntimeError("No search API key configured — set TAVILY_API_KEY or SERPAPI_KEY in .env")


def execute_python(code: str, timeout: int = 15) -> dict:
    """Execute Python code in a sandboxed subprocess and return stdout/stderr."""
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        f.write(textwrap.dedent(code))
        fname = f.name
    try:
        result = subprocess.run(
            ["python3", fname],
            capture_output=True, text=True, timeout=timeout
        )
        return {
            "stdout": result.stdout[:4000],
            "stderr": result.stderr[:1000],
            "exit_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"error": f"Code execution timed out after {timeout}s"}


def http_request(method: str, url: str, headers: dict = None, body: dict = None) -> dict:
    """Make an HTTP request to any REST API endpoint."""
    try:
        resp = httpx.request(
            method.upper(), url,
            headers=headers or {},
            json=body,
            timeout=15,
        )
        try:
            data = resp.json()
        except Exception:
            data = resp.text[:2000]
        return {"status": resp.status_code, "body": data}
    except Exception as e:
        return {"error": str(e)}


def finish_run(summary: str) -> dict:
    """Signal that the agent has completed the goal."""
    return {"done": True, "summary": summary}


# ── Registry + Schemas ────────────────────────────────────────────────────────

TOOL_REGISTRY = {
    "web_search": web_search,
    "execute_python": execute_python,
    "http_request": http_request,
    "finish_run": finish_run,
}

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for current information. Returns titles, URLs, and snippets. Requires TAVILY_API_KEY or SERPAPI_KEY.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query"},
                    "num_results": {"type": "integer", "default": 5, "description": "Number of results"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_python",
            "description": "Execute Python code and return the output. Use for data processing, calculations, file I/O.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute"},
                    "timeout": {"type": "integer", "default": 15},
                },
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "http_request",
            "description": "Make an HTTP request to a REST API endpoint.",
            "parameters": {
                "type": "object",
                "properties": {
                    "method": {"type": "string", "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"]},
                    "url": {"type": "string"},
                    "headers": {"type": "object"},
                    "body": {"type": "object"},
                },
                "required": ["method", "url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finish_run",
            "description": "Call this when the goal is fully completed to end the agent loop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "A concise summary of what was accomplished"},
                },
                "required": ["summary"],
            },
        },
    },
]
