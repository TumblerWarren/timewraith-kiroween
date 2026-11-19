"""Repository intent: what the project itself says about time behaviour, before anything is called a bug.

A violation of a fixed rule can be the project's deliberate design. Cron schedulers fire each wall-clock time once
and skip the repeated hour on a fall-back night, and libraries may pin a reference zone on purpose. The project
usually says so in its own tests, its docs or its comments. This module finds those passages with plain text
search, so it works for any repository and language:
- test files (by path convention) that mention the code under test or its module, and
- docs (README, CHANGELOG, docs/, *.md) that mention it,
keeping only lines with time-transition words (DST, fall back, overlap, ambiguous, skipped, leap, month end,
midnight, time zone, an IANA zone name ...).

The Raven reads these snippets. A verdict of intended behaviour counts only when it cites a test or doc line that
code resolves, and every cited test file passes on the original revision (pipeline._verify).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .analyze import is_test_file

TIME_WORDS = re.compile(
    r"\b(dst|daylight|summer[ -]?time|winter[ -]?time|fall[- ]?back|falls back|spring[- ]?forward|overlap\w*|"
    r"ambiguous|repeated|repeats|twice|skip\w*|gap|non-?existent|leap|month[- ]end|end of (the )?month|midnight|"
    r"cancel\w*|retr(?:y|ies)|timers?|expir\w*|ttl|deadlines?|durations?|"
    r"elapsed|monotonic|clock jumps?|milliseconds?|seconds?|calendar|local date|recurr\w*|next run|"
    r"time ?zones?|tz|utc|gmt|offset|wall[- ]?clock|transition\w*)\b"
    r"|\b[A-Z][a-z]+/[A-Z][A-Za-z_]+\b",  # IANA zone names such as America/New_York
    re.I,
)
DOC = re.compile(r"(^|/)(readme|changelog|history|docs?/|guide)|\.(md|mdx|rst|txt|adoc)$", re.I)
CONTEXT = 4
MAX_SNIPPETS = 14
MAX_CHARS = 10_000
MAX_FILE_BYTES = 1_000_000


@dataclass
class Snippet:
    path: str
    start: int  # 1-based
    end: int
    kind: str  # "test" | "doc"
    text: str  # numbered lines

    def render(self) -> str:
        return f"[{self.kind}] {self.path}:{self.start}-{self.end}\n{self.text}"


def is_doc_file(path: str) -> bool:
    return bool(DOC.search(path)) and not is_test_file(path)


def _mentions(text: str, names: list[str]) -> bool:
    return any(re.search(rf"\b{re.escape(n)}\b", text) for n in names if n)


SITUATION_WORDS = {
    "fall-back": re.compile(
        r"fall[- ]?back|falls back|overlap\w*|repeat\w*|twice|ambiguous|second occurrence|first occurrence|"
        r"end of dst|dst end\w*|backward",
        re.I,
    ),
    "spring-forward": re.compile(
        r"spring[- ]?forward|\bgap\b|skip\w*|non-?existent|does not exist|doesn't exist|missing hour|"
        r"start of dst|dst start\w*|forward",
        re.I,
    ),
}


def find(
    ws: Path, tracked: list[str], unit_name: str, unit_path: str, zone: str, situation: str | None = None
) -> list[Snippet]:
    """Passages in the repository's own tests and docs about time behaviour of the code under test.

    `situation` ("fall-back" or "spring-forward", from the violation's clock point) ranks passages about the same
    kind of transition first."""
    special = SITUATION_WORDS.get(situation or "")
    related = local_imports(ws / unit_path)
    stem = Path(unit_path).stem
    names = [unit_name, stem] if stem.lower() not in {"index", "main", "utils", "util"} else [unit_name]
    zone_words = [zone, zone.split("/")[-1].replace("_", " ")] if "/" in zone else [zone]
    scored: list[tuple[int, Snippet]] = []
    for rel in tracked:
        kind = "test" if is_test_file(rel) else "doc" if is_doc_file(rel) else ""
        p = ws / rel
        if not kind or p.is_symlink() or not p.is_file() or p.stat().st_size > MAX_FILE_BYTES:
            continue
        text = p.read_bytes().decode("utf-8", errors="replace")
        about_unit = _mentions(text, names)
        about_dep = not about_unit and _mentions(text, related)
        if not about_unit and not about_dep and not (kind == "test" and _mentions(text, zone_words)):
            continue
        lines = text.splitlines()
        hits = [i for i, ln in enumerate(lines) if TIME_WORDS.search(ln)]
        for a, b in _windows(hits, len(lines)):
            body = "\n".join(f"{n + 1}\t{lines[n]}" for n in range(a, b + 1))
            window = "\n".join(lines[a : b + 1])
            score = (
                (4 if kind == "test" else 2)
                + (3 if about_unit else 1 if about_dep else 0)
                + (2 if _mentions(window, zone_words) else 0)
            )
            score += min(4, len(TIME_WORDS.findall(window)))
            if special:
                score += 6 * min(2, len(special.findall(window)))
            scored.append((score, Snippet(rel, a + 1, b + 1, kind, body)))
    scored.sort(key=lambda s: (-s[0], s[1].path, s[1].start))
    out: list[Snippet] = []
    total = 0
    for _, sn in scored:
        if len(out) >= MAX_SNIPPETS:
            break
        if total + len(sn.text) > MAX_CHARS:
            continue  # a smaller passage further down may still fit
        out.append(sn)
        total += len(sn.text)
    return out


_IMPORT = re.compile(
    r"""import\s+(?:type\s+)?(?P<what>[\w*\s{},]+?)\s+from\s+['"](?P<mod>\.[^'"]+)['"]"""
    r"""|(?:const|let|var)\s+(?P<cwhat>[\w\s{},:]+?)\s*=\s*require\(\s*['"](?P<cmod>\.[^'"]+)['"]\s*\)"""
    r"""|^\s*from\s+(?P<pmod>\.[\w.]*)\s+import\s+(?P<pwhat>[\w\s,()]+)""",  # Python relative imports
    re.M,
)
_GENERIC = {"default", "as", "type", "logger", "log", "config", "utils", "util", "index", "constants", "types"}


def local_imports(source: Path, limit: int = 20) -> list[str]:
    """Names the code under test imports from its own repository (relative imports), plus those modules' file
    names. Tests often exercise a dependency directly; this finds them without a language parser."""
    try:
        text = source.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    names: list[str] = []
    for m in _IMPORT.finditer(text):
        what = m.group("what") or m.group("cwhat") or m.group("pwhat") or ""
        mod = m.group("mod") or m.group("cmod") or m.group("pmod") or ""
        for w in re.findall(r"[A-Za-z_]\w{2,}", what.replace(" as ", " ")):
            if w.lower() not in _GENERIC and w not in names:
                names.append(w)
        stem = Path(mod.replace(".", "/") if mod.startswith(".") and "/" not in mod else mod).stem
        if stem and stem.lower() not in _GENERIC and len(stem) > 2 and stem not in names:
            names.append(stem)
    return names[:limit]


MAX_WINDOW = 18


def _windows(hits: list[int], n: int) -> list[tuple[int, int]]:
    """Merge hit lines into windows with CONTEXT lines around each (0-based, inclusive), then split long
    windows into pieces of at most MAX_WINDOW lines, so no part of a dense test file is dropped."""
    merged: list[tuple[int, int]] = []
    for h in hits:
        a, b = max(0, h - CONTEXT), min(n - 1, h + CONTEXT)
        if merged and a <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    out: list[tuple[int, int]] = []
    for a, b in merged:
        while a <= b:
            out.append((a, min(b, a + MAX_WINDOW - 1)))
            a += MAX_WINDOW
    return out
