"""TimeWraith fix tools for Kiro CLI: a stdio MCP server that forwards every call to the TimeWraith backend.

Runs inside the Kiro Crew container, started by kiro-cli from the tw-doctor-stitch agent profile. It holds no
logic and no repository: the backend owns the tools, the workspace, the limits and the audit. TW_URL and TW_TOKEN
come from the environment of the one `kiro-cli chat` call; the token works only while that fix attempt runs.
Standard library only (the image has python3 and nothing else we rely on).
"""

import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("TW_URL", "").rstrip("/")
TOKEN = os.environ.get("TW_TOKEN", "")


def post(path, body):
    req = urllib.request.Request(
        URL + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-TW-Session": TOKEN},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=900) as r:  # tests in the sandbox can take minutes
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return {"error": json.loads(e.read().decode("utf-8")).get("error", {}).get("message", str(e))}
        except ValueError:
            return {"error": str(e)}
    except (urllib.error.URLError, OSError, ValueError) as e:
        return {"error": "TimeWraith backend unreachable: " + str(e)}


def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        mid, method = msg.get("id"), msg.get("method")
        if mid is None:
            continue  # notifications
        params = msg.get("params") or {}
        if method == "initialize":
            result = {
                "protocolVersion": params.get("protocolVersion", "2025-06-18"),
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "timewraith", "version": "1"},
            }
        elif method == "tools/list":
            r = post("/api/v1/internal/fix-tools/list", {})
            result = {"tools": r.get("tools", [])}
        elif method == "tools/call":
            r = post("/api/v1/internal/fix-tools/call", {"name": params.get("name"), "arguments": params.get("arguments") or {}})
            text = r.get("result") if "result" in r else "Error: " + str(r.get("error", "unknown error"))
            result = {"content": [{"type": "text", "text": text}], "isError": "result" not in r}
        elif method == "ping":
            result = {}
        else:
            send({"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": "Method not found"}})
            continue
        send({"jsonrpc": "2.0", "id": mid, "result": result})


if __name__ == "__main__":
    main()
