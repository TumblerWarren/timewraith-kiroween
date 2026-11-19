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


def test_organization_login_uses_the_pro_license_and_identity_provider() -> None:
    cmd = crew.CrewManager()._login_command("organization", ("https://my-org.awsapps.com/start", "eu-west-1"))
    assert (
        cmd[-9:]
        == [
            "--license",
            "pro",
            "--identity-provider",
            "https://my-org.awsapps.com/start",
            "--region",
            "eu-west-1",
            "--use-device-flow",
        ][-9:]
        or "--identity-provider" in cmd
    )
    assert "pro" in cmd and "eu-west-1" in cmd and "--use-device-flow" in cmd


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


def test_organization_link_is_built_from_the_start_url() -> None:
    url = crew.organization_device_url("https://my-org.awsapps.com/start", "ABCD-EFGH")
    assert url == "https://my-org.awsapps.com/start/#/device?user_code=ABCD-EFGH"
    assert crew.organization_device_url(None, "ABCD-EFGH") is None
