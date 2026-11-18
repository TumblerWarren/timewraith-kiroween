"""ESLint's own fixes are kept for the fix's lines and refused when they would rewrite the maintainers' code."""

from __future__ import annotations

from pathlib import Path

from timewraith import pipeline, sandbox


def _run(tmp_path: Path, original: str, fixed: str) -> str:
    src = tmp_path / "src.ts"
    src.write_text(original, encoding="utf-8")

    def sh(cmd: str) -> sandbox.Exec:
        assert "eslint --fix" in cmd
        src.write_text(fixed, encoding="utf-8")
        return sandbox.Exec(0, "")

    pipeline._eslint_fix(tmp_path, sh, ["src.ts"], ["src.ts"])
    return src.read_text(encoding="utf-8")


def test_a_small_eslint_fix_is_kept(tmp_path: Path) -> None:
    before = "if (!a)\n  a = new Date(Math.floor(Date.now() / 1000) * 1000)\nb()\n"
    after = "if (!a) {\n  a = new Date(Math.floor(Date.now() / 1000) * 1000)\n}\nb()\n"
    assert _run(tmp_path, before, after) == after


def test_a_large_eslint_rewrite_is_put_back(tmp_path: Path) -> None:
    before = "".join(f"if (x{i}) y{i}()\n" for i in range(20))
    after = "".join(f"if (x{i}) {{\n  y{i}()\n}}\n" for i in range(20))
    assert _run(tmp_path, before, after) == before
