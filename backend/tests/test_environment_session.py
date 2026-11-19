from timewraith import agents as A


def test_environment_prompt_names_config_path_and_forbids_source_edits() -> None:
    text = A.prompt_environment_session(
        package_manager="pnpm",
        node="22",
        runner="jest",
        config_path=".tw/runner-env.cjs",
        harness="src/__tw__/canary.tw.test.ts",
        attempts=["No tests found"],
        scripts={"build": "tsc", "test": "jest"},
        tool_calls=100,
        commands=50,
    )
    assert ".tw/runner-env.cjs" in text
    assert "Never edit the source under test" in text
    assert "No tests found" in text
    assert "build: tsc" in text
