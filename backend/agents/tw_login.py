"""Kiro sign-in with Google, GitHub or an organization for the Crew container, started by the backend (crew.py).

`kiro-cli login` shows its sign-in menu (Builder ID, Google, GitHub, Your Organization) only in a terminal, and
has no flag for Google or GitHub in this CLI version. This helper runs it in a pseudo-terminal, selects the
requested entry by its label, and copies everything kiro-cli prints to stdout, where the backend reads the
one-time code and the sign-in link. The user approves in their own browser; no password or token passes here.
An organization (IAM Identity Center) runs `kiro-cli login --license pro` with the start URL and region; kiro-cli
needs a terminal for it too, and some versions still ask for the URL and region, which this helper answers.
Exits with kiro-cli's exit code; 3 if the menu did not offer the method, 4 if no menu appeared.
Standard library only (the image has python3 and nothing else we rely on).
"""

import os
import pty
import re
import select
import signal
import sys
import time

LABELS = {"google": "Use with Google", "github": "Use with GitHub"}
ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
MENU_WAIT_S = 30


# Prompts kiro-cli may show for an organization sign-in, and which answer each one takes.
# kiro-cli 2.27 shows "? Enter Start URL › https://..." with the value from the options already filled in.
URL_PROMPT = re.compile(r"^\s*\?\s*.*(start\s*url|identity\s*provider)", re.I)
REGION_PROMPT = re.compile(r"^\s*\?\s*.*\bregion\b", re.I)


def answer(tail, value):
    """Enter alone when the prompt already shows the value, else the value then Enter."""
    return "\r" if value in tail else value + "\r"


def organization(url, region):
    """Run the Identity Center sign-in in a terminal and answer the prompts some kiro-cli versions show."""
    args = [
        "kiro-cli",
        "login",
        "--license",
        "pro",
        "--identity-provider",
        url,
        "--region",
        region,
        "--use-device-flow",
    ]
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("kiro-cli", args)  # noqa: S606 (fixed program; url and region were validated by the backend)
    seen, answered = "", set()
    while True:
        ready, _, _ = select.select([fd], [], [], 0.5)
        if not ready:
            continue
        try:
            data = os.read(fd, 4096)
        except OSError:
            break
        if not data:
            break
        text = data.decode("utf-8", "replace")
        sys.stdout.write(text)
        sys.stdout.flush()
        seen = (seen + ANSI.sub("", text))[-20000:]
        tail = seen.rstrip(" ").splitlines()[-1] if seen.strip() else ""
        if "url" not in answered and URL_PROMPT.search(tail):
            time.sleep(0.3)  # let the prompt finish drawing before answering
            os.write(fd, answer(tail, url).encode())
            answered.add("url")
        elif "region" not in answered and REGION_PROMPT.search(tail):
            time.sleep(0.3)
            os.write(fd, answer(tail, region).encode())
            answered.add("region")
    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status)


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "organization":
        return organization(sys.argv[2], sys.argv[3])
    want = LABELS.get(sys.argv[1] if len(sys.argv) > 1 else "")
    if want is None:
        sys.stderr.write("usage: tw_login.py google|github|organization URL REGION\n")
        return 2
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("kiro-cli", ["kiro-cli", "login"])  # noqa: S606 (fixed program and arguments)
    seen = ""
    chosen = False
    deadline = time.time() + MENU_WAIT_S
    while True:
        ready, _, _ = select.select([fd], [], [], 0.5)
        if ready:
            try:
                data = os.read(fd, 4096)
            except OSError:
                break  # the child closed the terminal: it finished
            if not data:
                break
            text = data.decode("utf-8", "replace")
            sys.stdout.write(text)
            sys.stdout.flush()
            seen = (seen + ANSI.sub("", text))[-20000:]
            if not chosen and "Select login method" in seen and "Use with Your Organization" in seen:
                options = re.findall(r"Use with [A-Za-z ]*[A-Za-z]", seen.split("Select login method", 1)[1])
                order = list(dict.fromkeys(options))
                if want not in order:
                    os.kill(pid, signal.SIGKILL)
                    sys.stderr.write(f"The sign-in menu did not offer {want!r}: {order}\n")
                    return 3
                os.write(fd, ("\x1b[B" * order.index(want) + "\r").encode())
                chosen = True
        elif not chosen and time.time() > deadline:
            os.kill(pid, signal.SIGKILL)
            sys.stderr.write("kiro-cli showed no sign-in menu\n")
            return 4
    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status)


if __name__ == "__main__":
    sys.exit(main())
