"""Kiro sign-in with Google or GitHub for the Crew container, started by the TimeWraith backend (crew.py).

`kiro-cli login` shows its sign-in menu (Builder ID, Google, GitHub, Your Organization) only in a terminal, and
has no flag for Google or GitHub in this CLI version. This helper runs it in a pseudo-terminal, selects the
requested entry by its label, and copies everything kiro-cli prints to stdout, where the backend reads the
one-time code and the sign-in link. The user approves in their own browser; no password or token passes here.
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


def main():
    want = LABELS.get(sys.argv[1] if len(sys.argv) > 1 else "")
    if want is None:
        sys.stderr.write("usage: tw_login.py google|github\n")
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
