import json
from pathlib import Path

from timewraith.analyze import analyze


def _repo(tmp_path: Path, pkg: dict[str, object]) -> Path:
    (tmp_path / "package.json").write_text(json.dumps(pkg), encoding="utf-8")
    (tmp_path / "index.js").write_text("module.exports = 1\n", encoding="utf-8")
    return tmp_path


def _reason(tmp_path: Path) -> str:
    report = analyze(tmp_path)
    assert report.test_runner is None
    return next(i.reason for i in report.items if i.id == "adapter.js_tests")


def test_mocha_repo_is_named_in_the_message(tmp_path: Path) -> None:
    root = _repo(tmp_path, {"devDependencies": {"mocha": "^10"}, "scripts": {"test": "mocha"}})
    assert "mocha" in _reason(root)


def test_node_test_runner_is_named(tmp_path: Path) -> None:
    root = _repo(tmp_path, {"scripts": {"test": "node --test"}})
    assert "node:test" in _reason(root)


def test_no_runner_at_all_says_so(tmp_path: Path) -> None:
    assert "No test runner" in _reason(_repo(tmp_path, {"name": "x"}))


def test_jest_repo_is_ready(tmp_path: Path) -> None:
    assert analyze(_repo(tmp_path, {"devDependencies": {"jest": "^29"}})).test_runner == "jest"
