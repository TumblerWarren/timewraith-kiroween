import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReduceMotionProvider } from "../a11y/ReduceMotionProvider";
import { App } from "../App";
import { SECTION_IDS, SECTION_NODES } from "../content/nodes";
import { LINKS } from "../config/links";
import { GATEWAY_LABEL } from "../content/copy";

function renderApp() {
  return render(
    <ReduceMotionProvider>
      <App />
    </ReduceMotionProvider>,
  );
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-reduce-motion");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App shell landmarks (Requirements 1.4, 11.3, 17.1)", () => {
  it("has one h1, one banner, one nav, one main and the footer as contentinfo after main", () => {
    renderApp();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    const main = screen.getByRole("main");
    const footer = screen.getByRole("contentinfo");
    expect(main).not.toContainElement(footer);
    expect(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(footer).toHaveClass("site-footer");
  });

  it("renders the seven regions in order inside main, each labelled by its heading", () => {
    renderApp();
    const main = screen.getByRole("main");
    const sections = Array.from(main.querySelectorAll(":scope > section"));
    expect(sections.map((s) => s.id)).toEqual([...SECTION_IDS]);
    for (const section of sections) {
      expect(section).toHaveClass("section", `section--${section.id}`);
      const labelledBy = section.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy as string)).toHaveTextContent(/\S/);
    }
  });

  it("has a skip link to main as the first focusable element", async () => {
    renderApp();
    const link = screen.getByRole("link", { name: "Skip to content" });
    expect(link).toHaveClass("skip-link");
    expect(link).toHaveAttribute("href", "#main");
    expect(document.getElementById("main")).toBe(screen.getByRole("main"));
    await userEvent.tab();
    expect(link).toHaveFocus();
  });

  it("credits Kiro Crew, the Playwright Clock documentation and Kiroween 2026 in the footer, with the demo and GitHub links", () => {
    renderApp();
    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: LINKS.demo.label })).toHaveAttribute("href", LINKS.demo.href);
    expect(footer.getByRole("link", { name: LINKS.github.label })).toHaveAttribute("href", LINKS.github.href);
    expect(footer.getByRole("link", { name: "Kiro Crew" })).toHaveAttribute("href", LINKS.kiroCrew.href);
    expect(footer.getByRole("link", { name: "Playwright Clock documentation" })).toHaveAttribute(
      "href",
      LINKS.playwrightClock.href,
    );
    expect(footer.getByRole("link", { name: "Kiroween 2026" })).toHaveAttribute("href", LINKS.kiroween.href);
  });
});

describe("AppHeader", () => {
  it("links every region by native anchor with its clock stamp and shows the gateway badge", () => {
    renderApp();
    expect(within(screen.getByRole("banner")).getByText(GATEWAY_LABEL)).toBeInTheDocument();
    const nav = within(screen.getByRole("navigation", { name: "Board" }));
    const links = nav.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(SECTION_NODES.map((n) => `#${n.id}`));
    SECTION_NODES.forEach((node, i) => {
      expect(links[i]).toHaveTextContent(node.stamp);
    });
  });

  it("toggles Reduce Motion, announces the new state, stores the choice and updates the html attribute", async () => {
    stubMatchMedia(false);
    renderApp();
    const toggle = screen.getByRole("button", { name: /^Reduce motion/ });
    const live = screen.getByRole("status");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement).toHaveAttribute("data-reduce-motion", "false");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(live).toHaveTextContent("Reduced motion on");
    expect(window.localStorage.getItem("tw.reduceMotion")).toBe("on");
    expect(document.documentElement).toHaveAttribute("data-reduce-motion", "true");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(live).toHaveTextContent("Reduced motion off");
    expect(window.localStorage.getItem("tw.reduceMotion")).toBe("off");
    expect(document.documentElement).toHaveAttribute("data-reduce-motion", "false");
  });
});

describe("ReduceMotionProvider initial state (Requirements 10.2, 10.3)", () => {
  it("starts on when the media query matches and nothing is stored", () => {
    stubMatchMedia(true);
    renderApp();
    expect(screen.getByRole("button", { name: /^Reduce motion/ })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveAttribute("data-reduce-motion", "true");
  });

  it("lets a stored 'off' override a matching media query", () => {
    stubMatchMedia(true);
    window.localStorage.setItem("tw.reduceMotion", "off");
    renderApp();
    expect(screen.getByRole("button", { name: /^Reduce motion/ })).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement).toHaveAttribute("data-reduce-motion", "false");
  });

  it("lets a stored 'on' override a non-matching media query", () => {
    stubMatchMedia(false);
    window.localStorage.setItem("tw.reduceMotion", "on");
    renderApp();
    expect(screen.getByRole("button", { name: /^Reduce motion/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores an invalid stored value and falls back to the media query", () => {
    stubMatchMedia(true);
    window.localStorage.setItem("tw.reduceMotion", "maybe");
    renderApp();
    expect(screen.getByRole("button", { name: /^Reduce motion/ })).toHaveAttribute("aria-pressed", "true");
  });
});
