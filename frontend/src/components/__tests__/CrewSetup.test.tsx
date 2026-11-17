import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider";
import type { Api } from "../../api/client";
import type { SetupStatus } from "../../api/types";
import { DOCKER_SETUP, GITHUB_SETUP, SETUP } from "../../content/copy";
import { SetupProvider } from "../../app/SetupProvider";
import { CrewSetup } from "../CrewSetup";
import { CrewRemoval } from "../CrewRemoval";

const base: SetupStatus = {
  docker: { installed: true, running: false, starting: false, can_start: true },
  crew: { image: "ghcr.io/kirodotdev/kirocrew:stable", container: "missing", install: "idle", install_error: null, signed_in: false },
  login: { state: "idle", code: null, url: null, error: null },
};

function fakeApi(states: SetupStatus[]): Api {
  let i = 0;
  const next = async () => states[Math.min(i++, states.length - 1)] as SetupStatus;
  const fail = async (): Promise<never> => Promise.reject(new Error("unused"));
  return {
    health: async () => ({ gateway: "connected", agent_runtime: { name: "stub", label: "Stub" }, sandbox: { available: false, detail: "" }, git: true }),
    flow: async () => [],
    list: async () => [],
    get: fail,
    create: fail,
    approvePlan: fail,
    cancel: fail,
    decideFix: fail,
    retest: fail,
    branchPatchUrl: () => "",
    makeBranch: vi.fn(fail),
    githubPreview: vi.fn(fail),
    githubPush: vi.fn(fail),
    githubPullRequest: vi.fn(fail),
    githubStart: vi.fn(fail),
    githubLogin: vi.fn(fail),
    githubCancel: vi.fn(fail),
    githubLogout: vi.fn(fail),
    patchUrl: () => "",
    events: () => () => undefined,
    setup: vi.fn(next),
    startDocker: vi.fn(next),
    startCrew: vi.fn(next),
    startLogin: vi.fn(next),
    cancelLogin: vi.fn(next),
    logout: vi.fn(next),
    deleteCrew: vi.fn(next),
    deleteCase: fail,
  };
}

const renderWith = (api: Api) =>
  render(
    <ApiProvider api={api}>
      <SetupProvider>
        <CrewSetup />
      </SetupProvider>
    </ApiProvider>,
  );

describe("CrewSetup", () => {
  it("blocks GitHub when Docker is off and offers setup when Docker is available", async () => {
    const user = userEvent.setup();
    const github = { container: "missing", install: "idle", install_error: null, connected: false, user: null, scopes: "public_repo",
      login: { state: "idle", code: null, url: null, error: null } } as const;
    const stopped = renderWith(fakeApi([{ ...base, github }]));
    expect(await screen.findByText(GITHUB_SETUP.blocked)).toBeVisible();
    expect(screen.queryByRole("button", { name: GITHUB_SETUP.start })).not.toBeInTheDocument();
    stopped.unmount();
    const running = { ...base, docker: { ...base.docker, running: true, can_start: false }, github };
    const api = fakeApi([running]);
    vi.mocked(api.githubStart).mockResolvedValue({ ...running, github: { ...github, install: "building" } });
    renderWith(api);
    expect(await screen.findByText(DOCKER_SETUP.running)).toBeVisible();
    await user.click(screen.getByRole("button", { name: GITHUB_SETUP.start }));
    expect(api.githubStart).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(GITHUB_SETUP.building)).toBeVisible();
  });

  it("uses GitHub device sign-in, supports cancellation and confirms disconnect", async () => {
    const user = userEvent.setup();
    const github = { container: "running", install: "idle", install_error: null, connected: false, user: null, scopes: "public_repo",
      login: { state: "idle", code: null, url: null, error: null } } as const;
    const running = { ...base, docker: { ...base.docker, running: true, can_start: false }, github };
    const connected = { ...running, github: { ...github, connected: true, user: "reviewer" } };
    const api = fakeApi([running]);
    const pending: SetupStatus = { ...running, github: { ...github, login: { state: "pending", code: "GITX-1234", url: "https://github.com/login/device", error: null } } };
    vi.mocked(api.setup).mockResolvedValue(pending).mockResolvedValueOnce(running);
    vi.mocked(api.githubLogin).mockResolvedValueOnce(pending).mockResolvedValueOnce(connected);
    vi.mocked(api.githubCancel).mockImplementation(async () => {
      vi.mocked(api.setup).mockResolvedValue(running);
      return running;
    });
    vi.mocked(api.githubLogout).mockResolvedValue(running);
    renderWith(api);
    await user.click(await screen.findByRole("button", { name: GITHUB_SETUP.connect }));
    expect(await screen.findByText("GITX-1234")).toBeVisible();
    expect(screen.getByRole("link", { name: GITHUB_SETUP.open })).toHaveAttribute("href", "https://github.com/login/device");
    await user.click(screen.getByRole("button", { name: GITHUB_SETUP.cancel }));
    expect(api.githubCancel).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole("button", { name: GITHUB_SETUP.connect }));
    expect(await screen.findByText(GITHUB_SETUP.connectedAs("reviewer"))).toBeVisible();
    await user.click(screen.getByRole("button", { name: GITHUB_SETUP.disconnect }));
    expect(api.githubLogout).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: GITHUB_SETUP.disconnect }));
    expect(api.githubLogout).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: GITHUB_SETUP.connect })).toBeEnabled();
  });

  it("switches account through logout and offers all three sign-in methods", async () => {
    const user = userEvent.setup();
    const signedIn: SetupStatus = { ...base, docker: { ...base.docker, running: true }, crew: { ...base.crew, container: "running", signed_in: true } };
    const api = fakeApi([signedIn, { ...signedIn, crew: { ...signedIn.crew, signed_in: false } }]);
    renderWith(api);
    await user.click(await screen.findByRole("button", { name: SETUP.switchAccount }));
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: SETUP.signInGoogle })).toBeEnabled();
    expect(screen.getByRole("button", { name: SETUP.signInGitHub })).toBeEnabled();
    expect(screen.getByRole("button", { name: SETUP.startLogin })).toBeEnabled();
  });

  it("deletes the Crew only after confirmation and refreshes setup", async () => {
    const user = userEvent.setup();
    const running: SetupStatus = { ...base, docker: { ...base.docker, running: true }, crew: { ...base.crew, container: "running", signed_in: true } };
    const removed: SetupStatus = { ...running, crew: { ...base.crew }, login: { ...base.login } };
    const api = fakeApi([running, removed]);
    render(<ApiProvider api={api}><SetupProvider><CrewRemoval /></SetupProvider></ApiProvider>);
    await user.click(await screen.findByRole("button", { name: "Delete Crew" }));
    expect(api.deleteCrew).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep Crew" }));
    expect(api.deleteCrew).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete Crew" }));
    expect(screen.getByText(/Running investigations will lose/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Crew and sign-in" }));
    expect(api.deleteCrew).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Crew deleted");
  });

  it("blocks deleting the Crew when Docker is stopped", async () => {
    render(<ApiProvider api={fakeApi([base])}><SetupProvider><CrewRemoval /></SetupProvider></ApiProvider>);
    expect(await screen.findByRole("button", { name: "Delete Crew" })).toBeDisabled();
    expect(screen.getByText("Start Docker to delete the Crew.")).toBeInTheDocument();
  });

  it("says the backend is offline without a backend", () => {
    render(<CrewSetup />);
    expect(screen.getByText(/backend is offline/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Start Docker first and blocks the later steps", async () => {
    const user = userEvent.setup();
    const api = fakeApi([base, { ...base, docker: { ...base.docker, starting: true, can_start: false } }]);
    renderWith(api);
    const start = await screen.findByRole("button", { name: SETUP.startDocker });
    expect(screen.getByText(/needs Docker/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SETUP.startLogin })).toBeNull();
    await user.click(start);
    expect(api.startDocker).toHaveBeenCalled();
    expect(await screen.findByText(/starting/)).toBeInTheDocument();
  });

  it("shows the device code and the sign-in page while the login waits for approval", async () => {
    const user = userEvent.setup();
    const running = { ...base, docker: { ...base.docker, running: true, can_start: false }, crew: { ...base.crew, container: "running" as const } };
    const pending = { ...running, login: { state: "pending" as const, code: "TNST-SPBB", url: "https://view.awsapps.com/start/#/device?user_code=TNST-SPBB", error: null } };
    const api = fakeApi([running, pending]);
    renderWith(api);
    await user.click(await screen.findByRole("button", { name: SETUP.startLogin }));
    expect(api.startLogin).toHaveBeenCalled();
    expect(await screen.findByText("TNST-SPBB")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: SETUP.openSignIn });
    expect(link).toHaveAttribute("href", "https://view.awsapps.com/start/#/device?user_code=TNST-SPBB");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("cancels a pending sign-in and offers to sign in again", async () => {
    const user = userEvent.setup();
    const running = { ...base, docker: { ...base.docker, running: true, can_start: false }, crew: { ...base.crew, container: "running" as const } };
    const pending = { ...running, login: { state: "pending" as const, code: "TNST-SPBB", url: "https://view.awsapps.com/start/#/device?user_code=TNST-SPBB", error: null } };
    let current: SetupStatus = pending;
    const api = {
      ...fakeApi([pending]),
      setup: vi.fn(async () => current),
      cancelLogin: vi.fn(async () => {
        current = running;
        return current;
      }),
    };
    renderWith(api);
    expect(await screen.findByText("TNST-SPBB")).toBeInTheDocument();
    expect(screen.getByText(SETUP.cancelHint)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: SETUP.cancelLogin }));
    expect(api.cancelLogin).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: SETUP.startLogin })).toBeInTheDocument();
    expect(screen.queryByText("TNST-SPBB")).toBeNull();
  });

  it("offers cancel before the code arrives, and a retry after a failed sign-in", async () => {
    const running = { ...base, docker: { ...base.docker, running: true, can_start: false }, crew: { ...base.crew, container: "running" as const } };
    const starting = { ...running, login: { state: "pending" as const, code: null, url: null, error: null } };
    const { unmount } = renderWith(fakeApi([starting]));
    expect(await screen.findByRole("button", { name: SETUP.cancelLogin })).toBeInTheDocument();
    unmount();
    const failed = { ...running, login: { state: "failed" as const, code: null, url: null, error: "Sign-in did not finish." } };
    renderWith(fakeApi([failed]));
    expect(await screen.findByText(SETUP.retryLead)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SETUP.signInGoogle })).toBeInTheDocument();
    expect(screen.getByText("Sign-in did not finish.")).toBeInTheDocument();
  });

  it("signs in with the method the user picks", async () => {
    const user = userEvent.setup();
    const running = { ...base, docker: { ...base.docker, running: true, can_start: false }, crew: { ...base.crew, container: "running" as const } };
    const pending = {
      ...running,
      login: { state: "pending" as const, code: "JSNZ-NGGR", url: "https://app.kiro.dev/account/device?user_code=JSNZ-NGGR&login_provider=Google", error: null, method: "google" as const },
    };
    const api = fakeApi([running, pending]);
    renderWith(api);
    expect(await screen.findByText(SETUP.methodHint)).toBeInTheDocument();
    const names = [SETUP.signInGoogle, SETUP.signInGitHub, SETUP.startLogin];
    for (const name of names) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: SETUP.signInGoogle }));
    expect(api.startLogin).toHaveBeenCalledWith("google");
    expect(await screen.findByText("JSNZ-NGGR")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: SETUP.openSignIn })).toHaveAttribute("href", expect.stringContaining("login_provider=Google"));
  });

  it("marks all three steps done once signed in", async () => {
    const done: SetupStatus = {
      docker: { installed: true, running: true, starting: false, can_start: false },
      crew: { ...base.crew, container: "running", signed_in: true },
      login: { state: "done", code: null, url: null, error: null },
    };
    const { container } = renderWith(fakeApi([done]));
    await screen.findByText(/signed in/);
    expect(screen.queryByText(/backend is offline/)).toBeNull();
    expect(Array.from(container.querySelectorAll(".crew-setup__step")).map((s) => s.getAttribute("data-state"))).toEqual(["done", "done", "done"]);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([SETUP.logout, SETUP.switchAccount]);
  });

  it("signs out only after a confirm that says what it stops", async () => {
    const user = userEvent.setup();
    const done: SetupStatus = {
      docker: { installed: true, running: true, starting: false, can_start: false },
      crew: { ...base.crew, container: "running", signed_in: true, account: "Builder ID · me@example.com" },
      login: { state: "done", code: null, url: null, error: null },
    };
    const out: SetupStatus = { ...done, crew: { ...done.crew, signed_in: false, account: null }, login: { ...done.login, state: "idle" } };
    const api = fakeApi([done, out]);
    renderWith(api);
    expect(await screen.findByText("Builder ID · me@example.com")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: SETUP.logout }));
    expect(screen.getByText(SETUP.logoutWarn)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: SETUP.logoutCancel }));
    expect(api.logout).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: SETUP.logout }));
    await user.click(screen.getByRole("button", { name: SETUP.logoutConfirm }));
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: SETUP.startLogin })).toBeInTheDocument();
  });
});
