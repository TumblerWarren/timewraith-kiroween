"""Temporal Discovery Engine: find time signals, group them into candidates by code unit, score them.

Deterministic and repository-agnostic: no repository names, paths or rules live here.
The MVP uses regex detectors and a brace-depth scope finder instead of Tree-sitter (design B8 fallback),
so signal confidence is capped at "medium" for pattern-only matches.
"""

from __future__ import annotations

import contextlib
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from . import ENGINE_VERSION
from .analyze import JS_EXT, is_test_file, iter_files, looks_like_test
from .models import BugCategory, Candidate, CodeUnit, FeatureMap, Signal

# kind -> (regex, confidence, weight)
CATALOG: dict[str, tuple[re.Pattern[str], str, float]] = {
    "time.now": (
        re.compile(
            r"\bDate\.now\(\)|\bnew Date\(\s*\)|\bperformance\.now\(\)|\bdayjs\(\s*\)|\bmoment\(\s*\)"
            r"|\bDateTime\.(now|local)\(\)|\bTemporal\.Now\."
        ),
        "high",
        1.5,
    ),
    "time.timer": (re.compile(r"\bset(Timeout|Interval)\s*\("), "medium", 1.0),
    "date.construct": (
        re.compile(r"\bnew Date\(\s*[^)\s]|\bDate\.(parse|UTC)\(|\bparseISO\(|\bDateTime\.from"),
        "medium",
        1.0,
    ),
    "date.arith": (
        re.compile(
            r"\.set(UTC)?(Date|Hours|Minutes|Month|FullYear)\(|\.getTime\(\)\s*[-+]"
            r"|\b(add|sub)(Seconds|Minutes|Hours|Days|Weeks|Months|Years)\(|\.(add|subtract)\(|\.(startOf|endOf)\("
            r"|\bdifferenceIn\w+\(|\.diff\("
        ),
        "high",
        2.0,
    ),
    "date.compare": (
        re.compile(
            r"\b(isBefore|isAfter|isSame\w*|isPast|isFuture|isExpired|compareAsc|compareDesc)\("
            r"|\.getTime\(\)\s*[<>]=?|[<>]=?\s*Date\.now\(\)|Date\.now\(\)\s*[<>]=?"
        ),
        "high",
        2.0,
    ),
    "tz.convert": (
        re.compile(
            r"\btimeZone\s*:|\btoLocale(Date|Time)?String\(|\bIntl\.DateTimeFormat\b"
            r"|\b(utcToZonedTime|zonedTimeToUtc|toZonedTime|fromZonedTime|formatInTimeZone)\("
            r"|\.tz\(|\.setZone\(|\bgetTimezoneOffset\(|\.utcOffset\("
        ),
        "high",
        2.0,
    ),
    "tz.fixed_offset": (
        re.compile(r"\b(24|3600|86400)\s*\*\s*(60|1000)|\*\s*60\s*\*\s*60\s*\*\s*1000|[+-]\d{2}:\d{2}['\"]"),
        "medium",
        1.5,
    ),
    "format.date": (
        re.compile(r"\.toISOString\(\)|\bformat\(\s*\w+\s*,\s*['\"]|\.toFormat\(|\.toDateString\(\)"),
        "low",
        0.5,
    ),
    "field.expiry": (
        re.compile(
            r"\b\w*(expir\w*|Expir\w*|ttl|TTL|validUntil|notBefore|notAfter|deadline|cutoff|"
            r"trialEnd\w*|gracePeriod\w*)\b"
        ),
        "medium",
        1.0,
    ),
    "field.schedule": (
        re.compile(
            r"\b\w*(cron|Cron|schedule|Schedule|recur\w*|rrule|startsAt|endsAt|renew\w*|"
            r"billing(Cycle|Date))\b"
        ),
        "medium",
        1.0,
    ),
    "cron.expr": (re.compile(r"['\"](\S+\s+){4,5}\S+['\"]"), "low", 2.0),
}
_CRON_FIELD = re.compile(r"^(\*|\d+|\*/\d+|\d+-\d+|\d+(,\d+)+|\?|L)$")
CONF_FACTOR = {"high": 1.0, "medium": 0.6, "low": 0.3}

_UNIT_START = [
    re.compile(r"^\s*(export\s+)?(default\s+)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\("),
    re.compile(
        r"^\s*(export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*(:\s*[^=]+)?=\s*(async\s+)?"
        r"(\([^)]*\)|[A-Za-z_$][\w$]*)\s*(:\s*[^=]+)?=>"
    ),
    re.compile(r"^\s*(export\s+)?(default\s+)?(abstract\s+)?class\s+([A-Za-z_$][\w$]*)"),
    re.compile(
        r"^\s*(public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*"
        r"(:\s*[^{]+)?\{\s*$"
    ),
]
_KEYWORDS = {"if", "for", "while", "switch", "catch", "function", "return", "constructor"}


@dataclass
class _Unit:
    name: str
    start: int
    end: int
    exported: bool


def _strip_strings(line: str) -> str:
    line = re.sub(r"//.*$", "", line)
    return re.sub(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`", "''", line)


def find_units(lines: list[str]) -> list[_Unit]:
    units: list[_Unit] = []
    text = "\n".join(lines)
    exported_names = set(re.findall(r"export\s*\{([^}]*)\}", text))
    names_in_export_list = {n.strip().split(" as ")[0] for grp in exported_names for n in grp.split(",")}
    for i, raw in enumerate(lines):
        name = None
        for rx in _UNIT_START:
            m = rx.match(raw)
            if m:
                name = next((g for g in reversed(m.groups()) if g and re.fullmatch(r"[A-Za-z_$][\w$]*", g)), None)
                if rx is _UNIT_START[1]:
                    name = m.group(3)
                break
        if not name or name in _KEYWORDS:
            continue
        depth, opened, end = 0, False, i
        for j in range(i, min(len(lines), i + 2000)):
            s = _strip_strings(lines[j])
            depth += s.count("{") - s.count("}")
            opened = opened or "{" in s
            end = j
            if opened and depth <= 0:
                break
            if not opened and j > i and s.strip().endswith(";"):
                break
        exported = (
            raw.lstrip().startswith("export")
            or name in names_in_export_list
            or f"exports.{name}" in text
            or re.search(rf"module\.exports\s*=[^;]*\b{re.escape(name)}\b", text) is not None
        )
        units.append(_Unit(name=name, start=i + 1, end=end + 1, exported=exported))
    return units


def _is_cron(literal: str) -> bool:
    fields = literal.strip("'\"").split()
    return 5 <= len(fields) <= 6 and all(_CRON_FIELD.match(f) for f in fields)


def _sid(*parts: object) -> str:
    return hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:12]


def scan(root: Path, max_bytes: int) -> tuple[list[Signal], dict[str, list[_Unit]], dict[str, int]]:
    signals: list[Signal] = []
    units_by_file: dict[str, list[_Unit]] = {}
    skipped: dict[str, int] = {}
    for f in iter_files(root):
        rel = f.relative_to(root).as_posix()
        if f.is_symlink() or f.suffix not in JS_EXT:
            continue
        if "/__tw__/" in f"/{rel}":  # TimeWraith's own adapters and harnesses are never the code under test
            continue
        if ".min." in f.name:
            skipped["minified"] = skipped.get("minified", 0) + 1
            continue
        try:
            if f.stat().st_size > max_bytes:
                skipped["too_large"] = skipped.get("too_large", 0) + 1
                continue
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            skipped["unreadable"] = skipped.get("unreadable", 0) + 1
            continue
        lines = text.splitlines()
        if "@generated" in "\n".join(lines[:5]) or (lines and sum(map(len, lines)) / len(lines) > 300):
            skipped["generated"] = skipped.get("generated", 0) + 1
            continue
        in_test = looks_like_test(rel, text[:6000])
        if in_test:
            skipped["test_files"] = skipped.get("test_files", 0) + 1
        else:
            units_by_file[rel] = find_units(lines)
        for n, line in enumerate(lines, start=1):
            code = re.sub(r"//.*$", "", line)
            for kind, (rx, conf, _w) in CATALOG.items():
                for m in rx.finditer(code):
                    if kind == "cron.expr" and not _is_cron(m.group(0)):
                        continue
                    signals.append(
                        Signal(
                            id=f"sig_{_sid(ENGINE_VERSION, rel, n, kind, m.start())}",
                            kind=kind,
                            path=rel,
                            line=n,
                            confidence=conf,  # type: ignore[arg-type]
                            excerpt=line.strip()[:200],
                            in_test=in_test,
                        )
                    )
                    break  # one signal per kind per line
    return signals, units_by_file, skipped


def _categories(kinds: set[str]) -> list[BugCategory]:
    cats: list[BugCategory] = []
    if kinds & {"tz.fixed_offset", "cron.expr"} or ("date.arith" in kinds and kinds & {"tz.convert", "field.schedule"}):
        cats.append("dst_transition")
    if kinds & {"date.compare", "time.timer"} and kinds & {"time.now", "field.expiry"}:
        cats.append("expiry_boundary")
    if kinds & {"date.arith", "format.date"}:
        cats.append("midnight_rollover")
    if kinds & {"tz.convert", "tz.fixed_offset", "date.construct"}:
        cats.append("timezone_conversion")
    return cats or ["other_temporal"]


def build_feature_map(root: Path, max_bytes: int, hint_terms: list[str] | None = None) -> FeatureMap:
    signals, units_by_file, skipped = scan(root, max_bytes)
    test_sources: dict[str, str] = {}
    for f in iter_files(root):
        rel = f.relative_to(root).as_posix()
        if f.is_symlink() or f.suffix not in JS_EXT:
            continue
        with contextlib.suppress(OSError):
            text = f.read_text(encoding="utf-8", errors="ignore")
            if looks_like_test(rel, text[:6000]):
                test_sources[rel] = text
    groups: dict[tuple[str, str, int, int, bool], list[Signal]] = {}
    for s in signals:
        if s.in_test:
            continue
        units = [u for u in units_by_file.get(s.path, []) if u.start <= s.line <= u.end]
        # Signals outside any function form one module-level candidate per file (end -1: set from its signals).
        u = min(units, key=lambda x: x.end - x.start) if units else _Unit("(module)", 1, -1, False)
        groups.setdefault((s.path, u.name, u.start, u.end, u.exported), []).append(s)

    hints = [t.lower() for t in (hint_terms or []) if len(t) >= 3]
    candidates: list[Candidate] = []
    for (path, name, start, end, exported), sigs in groups.items():
        if end < 0:
            end = max(s.line for s in sigs)
        kinds = {s.kind for s in sigs}
        best: dict[str, float] = {}
        for s in sigs:
            w = CATALOG[s.kind][2] * CONF_FACTOR[s.confidence]
            best[s.kind] = max(best.get(s.kind, 0.0), w)
        cats = _categories(kinds)
        parts = {
            "signals": min(6.0, sum(best.values())),
            "domain": min(3.0, (1.5 if {"time.now", "date.compare"} <= kinds else 0.0) + max(0, len(cats) - 1)),
            "reach": 1.0 if exported else 0.0,
            "testability": 0.0,
            "hint": 0.0,
        }
        stem = Path(path).stem.split(".")[0]
        tests = sorted(t for t, src in test_sources.items() if stem in src or (name != "(module)" and name in src))
        parts["testability"] = 1.0 if tests else (0.5 if exported else 0.0)
        hay = f"{path} {name} " + " ".join(s.excerpt for s in sigs).lower()
        if hints and any(h in hay.lower() for h in hints):
            parts["hint"] = 2.0
        dominant = max(best, key=lambda k: best[k])
        candidates.append(
            Candidate(
                id=f"cand_{_sid(ENGINE_VERSION, path, name, start)}",
                title=f"{name} · {dominant.replace('.', ' ')}",
                unit=CodeUnit(path=path, name=name, start_line=start, end_line=end, exported=exported),
                signal_ids=[s.id for s in sigs],
                bug_categories=cats,
                score=round(sum(parts.values()), 2),
                score_parts=parts,
                existing_tests=tests[:5],
            )
        )
    candidates.sort(key=lambda c: (-c.score, c.unit.path, c.unit.start_line))
    return FeatureMap(candidates=candidates, signals=signals, skipped=skipped)


def source_inventory(root: Path, max_bytes: int) -> list[str]:
    paths = []
    size = 0
    for file in iter_files(root):
        path = file.relative_to(root).as_posix()
        if (
            file.is_symlink()
            or file.suffix not in JS_EXT
            or ".min." in file.name
            or is_test_file(path)
            or "/__tw__/" in f"/{path}"
            or file.stat().st_size > max_bytes
        ):
            continue
        with contextlib.suppress(OSError):
            if looks_like_test(path, file.read_text(encoding="utf-8", errors="ignore")[:6000]):
                continue
        size += len(path) + 1
        if size > 60000:
            break
        paths.append(path)
    return paths


def source_candidate(path: str, lines: list[str], line: int, claim: str, category: BugCategory) -> Candidate:
    units = [unit for unit in find_units(lines) if unit.start <= line <= unit.end]
    unit = min(units, key=lambda u: u.end - u.start) if units else _Unit("(module)", 1, len(lines), False)
    return Candidate(
        id=f"cand_{_sid(ENGINE_VERSION, path, unit.name, unit.start)}",
        title=claim,
        rationale=claim,
        selected=True,
        unit=CodeUnit(path=path, name=unit.name, start_line=unit.start, end_line=unit.end, exported=unit.exported),
        signal_ids=[],
        score=0,
        score_parts={},
        bug_categories=[category],
    )
