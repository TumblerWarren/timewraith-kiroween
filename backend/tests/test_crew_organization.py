import pytest

from timewraith import crew


def test_valid_organization_is_accepted() -> None:
    assert crew.check_organization("https://my-org.awsapps.com/start", "us-east-1") == (
        "https://my-org.awsapps.com/start",
        "us-east-1",
    )


@pytest.mark.parametrize(
    "url",
    ["http://my-org.awsapps.com/start", "https://evil.example.com/start", "https://a.awsapps.com/s; rm -rf /", ""],
)
def test_bad_start_urls_are_rejected(url: str) -> None:
    with pytest.raises(ValueError, match="start"):
        crew.check_organization(url, "us-east-1")


def test_bad_region_is_rejected() -> None:
    with pytest.raises(ValueError, match="region"):
        crew.check_organization("https://my-org.awsapps.com/start", "us east 1")


def test_organization_login_runs_in_the_terminal_helper(monkeypatch: pytest.MonkeyPatch) -> None:
    import subprocess

    copied: list[list[str]] = []

    def fake_run(args: list[str], **kw: object) -> subprocess.CompletedProcess[str]:
        copied.append(args)
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(crew.subprocess, "run", fake_run)
    cmd = crew.CrewManager()._login_command("organization", ("https://my-org.awsapps.com/start", "eu-west-1"))
    assert copied, "the helper is copied into the container first"
    assert cmd[-4:] == [crew.LOGIN_HELPER_IN_CONTAINER, "organization", "https://my-org.awsapps.com/start", "eu-west-1"]
    assert "-i" not in cmd[:4] or cmd[2] != "-i"


def test_helper_knows_the_organization_prompts() -> None:
    import importlib.util

    pytest.importorskip("termios")  # the helper runs in the Linux container; Windows has no pty

    spec = importlib.util.spec_from_file_location("tw_login", crew.LOGIN_HELPER)
    assert spec and spec.loader
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    assert helper.URL_PROMPT.search("? Enter Start URL:")
    assert helper.REGION_PROMPT.search("? Enter Region:")
    assert not helper.URL_PROMPT.search("Logged in with IAM Identity Center (https://x.awsapps.com/start)")


def test_organization_failure_shows_the_cli_message() -> None:
    msg = crew.failure_message("\x1b[31merror: failed to construct request\x1b[0m\n", "organization")
    assert "failed to construct request" in msg and "start URL" in msg


def test_other_methods_keep_the_generic_message() -> None:
    assert crew.failure_message("anything", "google").startswith("Sign-in did not finish")


def test_identity_center_device_page_is_trusted() -> None:
    out = "Confirm the code in your browser\nCode: ABCD-EFGH\nhttps://device.sso.us-east-1.amazonaws.com/\n"
    assert crew.parse_device_output(out) == ("ABCD-EFGH", "https://device.sso.us-east-1.amazonaws.com/")


def test_an_untrusted_host_is_still_not_linked() -> None:
    assert crew.parse_device_output("Code: ABCD-EFGH\nhttps://evil.example.com/x\n") == ("ABCD-EFGH", None)


def test_the_real_identity_center_output_gives_code_and_link() -> None:
    out = (
        "? Enter Start URL \u203a https://devbuildtool.awsapps.com/start\n"
        "? Enter Region \u203a us-east-1\u2714 Enter Region \u00b7 us-east-1\n"
        "Confirm the following code in the browser\nCode: CKBW-XNLT\n"
        "Open this URL: https://us-east-1.signin.aws/platform/authorize?request_uri=urn%3Aabc&identitystore_id=d-1\n"
    )
    assert crew.parse_device_output(out) == (
        "CKBW-XNLT",
        "https://us-east-1.signin.aws/platform/authorize?request_uri=urn%3Aabc&identitystore_id=d-1",
    )


def test_an_organization_waits_for_the_named_link() -> None:
    early = "? Enter Start URL \u203a https://devbuildtool.awsapps.com/start\nCode: CKBW-XNLT\n"
    assert crew.parse_device_output(early, named_only=True) == ("CKBW-XNLT", None)
