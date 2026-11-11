import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAnnouncer } from "../../a11y/LiveAnnouncer";
import { ReduceMotionProvider } from "../../a11y/ReduceMotionProvider";
import { GATEWAY_LABEL } from "../../content/copy";
import { SECTION_NODES } from "../../content/nodes";
import { AppHeader, BOARD_NAV_LABEL, motionStateText, REDUCE_MOTION_LABEL, WORDMARK } from "../AppHeader";

function stubMatchMedia(reduced: boolean, compact = false) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion") ? reduced : compact,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

function renderHeader() {
  return render(
    <ReduceMotionProvider>
      <LiveAnnouncer>
        <AppHeader />
      </LiveAnnouncer>
    </ReduceMotionProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppHeader (Requirements 1.7, 6.5, 10.1, 10.10)", () => {
  it("shows the wordmark, the gateway badge text and a clock-stamp link per region", () => {
    stubMatchMedia(false);
    renderHeader();
    const banner = within(screen.getByRole("banner"));
    expect(banner.getByRole("link", { name: WORDMARK })).toHaveAttribute("href", "#open");
    expect(banner.getByText(GATEWAY_LABEL)).toBeInTheDocument();
    const links = within(screen.getByRole("navigation", { name: BOARD_NAV_LABEL })).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(SECTION_NODES.map((n) => `#${n.id}`));
    SECTION_NODES.forEach((node, i) => {
      expect(links[i]).toHaveAccessibleName(`${node.title} ${node.stamp}`);
    });
  });

  it("keeps the nav in a native details disclosure that is open on wide screens and closed on compact ones", () => {
    stubMatchMedia(false, false);
    const wide = renderHeader();
    expect(wide.container.querySelector("details.site-nav__menu")).toHaveAttribute("open");
    wide.unmount();

    stubMatchMedia(false, true);
    const { container } = renderHeader();
    const details = container.querySelector("details.site-nav__menu") as HTMLDetailsElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText(BOARD_NAV_LABEL, { selector: "summary" })).toBeInTheDocument();
  });

  it("hangs a decorative Mini Bat from the header, outside the links and hidden from assistive technology", () => {
    stubMatchMedia(false);
    const { container } = renderHeader();
    const perch = container.querySelector('[data-perch="nav-bat"]');
    expect(perch).toHaveAttribute("aria-hidden", "true");
    expect(perch?.closest("a, nav, button")).toBeNull();
    expect(perch?.querySelector('[data-mascot="mini-bat"]')).not.toBeNull();
  });

  it("says 'Motion: reduced (system setting)' when the media query decided, then the user's choice after a click", async () => {
    stubMatchMedia(true);
    renderHeader();
    const toggle = screen.getByRole("button", { name: new RegExp(`^${REDUCE_MOTION_LABEL}`) });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle.querySelector(".rm-toggle__state")).toHaveTextContent("Motion: reduced (system setting)");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle.querySelector(".rm-toggle__state")).toHaveTextContent(/^Motion: on$/);
    await userEvent.click(toggle);
    expect(toggle.querySelector(".rm-toggle__state")).toHaveTextContent(/^Motion: reduced$/);
    expect(screen.getByRole("status")).toHaveTextContent("Reduced motion on");
  });

  it("maps every mode and source to its visible text", () => {
    expect(motionStateText(false, "system")).toBe("Motion: on");
    expect(motionStateText(false, "user")).toBe("Motion: on");
    expect(motionStateText(true, "user")).toBe("Motion: reduced");
    expect(motionStateText(true, "system")).toBe("Motion: reduced (system setting)");
  });
});
