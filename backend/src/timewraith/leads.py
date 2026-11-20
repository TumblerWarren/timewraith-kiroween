"""Source leads: a suspicion an agent read in the code, with the line and the exact code it points at.

Bat Scout reads a file and says "line 84, this code: ...". Agents are good at finding the suspicious code and bad at
counting lines or copying a statement character for character. A lead used to be thrown away when the quote was not
inside the cited line. Code now looks for the quote where it really is, and only a quote that is nowhere in the file
(an invented one) is rejected. The line that comes out is always one where the quote was found in the real file, so
the evidence stays checked by code.
"""

from __future__ import annotations

import re

MIN_QUOTE_CHARS = 8  # a quote like `}` or `if (` would match anywhere and prove nothing


def _norm(text: str) -> str:
    """The text with all whitespace removed, so line breaks and spacing around punctuation do not matter."""
    return re.sub(r"\s+", "", text)


def locate(lines: list[str], line: int, quote: str) -> tuple[int, str] | None:
    """(line number, how) where `quote` is in `lines`, or None when it is not there.

    how: "cited" (the cited line holds it), "moved" (it is on another line, the closest one to the cited line).
    The quote may span several lines and may differ from the file in whitespace only.
    """
    wanted = _norm(quote)
    if len(wanted) < MIN_QUOTE_CHARS:
        return None
    first = _norm(next((part for part in quote.splitlines() if part.strip()), quote))
    span = max(1, len([part for part in quote.splitlines() if part.strip()])) + 3  # a statement may wrap
    hits: list[int] = []
    for index, text in enumerate(lines, start=1):
        if first and first[:16] not in _norm(text):  # the quote starts on this line; it may wrap onto the next
            continue
        if wanted in _norm("".join(lines[index - 1 : index - 1 + span])):
            hits.append(index)
    if not hits:
        return None
    best = min(hits, key=lambda n: abs(n - line))
    return best, "cited" if best == line else "moved"
