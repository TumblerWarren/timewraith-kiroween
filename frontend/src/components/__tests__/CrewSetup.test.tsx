import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider";
import type { Api } from "../../api/client";
import type { SetupStatus } from "../../api/types";
import { SETUP } from "../../content/copy";
import { SetupProvider } from "../../app/SetupProvider";
import { CrewSetup } from "../CrewSetup";

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
    patchUrl: () => "",
    events: () => () => undefined,
    setup: vi.fn(next),
    startDocker: vi.fn(next),
    startCrew: vi.fn(next),
    startLogin: vi.fn(next),
    logout: vi.fn(next),
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
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([SETUP.logout]);
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
