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
