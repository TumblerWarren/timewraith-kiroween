/// <reference types="node" />
import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LINKS } from "../../config/links";
import { CTA_DEMO, CTA_GITHUB, OPEN_A_CASE } from "../../content/copy";
import { Cta } from "../Cta";
import { PLACEHOLDER_FOOTNOTE, PLACEHOLDER_HINT, PLACEHOLDER_MARK } from "../PlaceholderBadge";

afterEach(() => {
  document.documentElement.removeAttribute("data-reduce-motion");
});

describe("Cta (Requirements 3.10, 5.6, 5.7, decision D19)", () => {
  it("renders one 'Open a case' button that scrolls to the Open-a-case panel and focuses it, with no URL change", async () => {
    const panel = document.createElement("section");
    panel.id = "open";
    const heading = document.createElement("h2");
    heading.id = "open-case-title";
    heading.tabIndex = -1;
    panel.append(heading);
    document.body.append(panel);
    const scroll = vi.fn();
    panel.scrollIntoView = scroll;
    document.documentElement.setAttribute("data-reduce-motion", "true");
    const path = window.location.href;

    render(<Cta />);
    const button = screen.getByRole("button", { name: OPEN_A_CASE });
    expect(button).toHaveClass("btn", "btn--primary");
    await userEvent.click(button);
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(heading).toHaveFocus();
    expect(window.location.href).toBe(path);
    panel.remove();
  });

  it("no longer carries the retired 'Enter the Clocktower' CTA or its note", () => {
    const { container } = render(<Cta />);
    expect(container.textContent).not.toMatch(/Enter the Clocktower|App opens in the next milestone/);
  });

  it("marks both secondary CTAs as placeholder links with a dagger, a hint and one shared footnote", () => {
    const { container } = render(<Cta />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [demo, github] = items;
    const demoLink = within(demo as HTMLElement).getByRole("link", { name: CTA_DEMO });
    const githubLink = within(github as HTMLElement).getByRole("link", { name: CTA_GITHUB });
    expect(demoLink).toHaveAttribute("href", LINKS.demo.href);
    expect(githubLink).toHaveAttribute("href", LINKS.github.href);
    for (const link of [demoLink, githubLink]) {
      // The dagger is visible text after the label, in the link's own color, and is not part of the name.
      expect(link).toHaveTextContent(`${link === demoLink ? CTA_DEMO : CTA_GITHUB}${PLACEHOLDER_MARK}`);
      expect(link.querySelector(".footnote-mark")).toBeVisible();
      expect(link).toHaveAccessibleDescription(PLACEHOLDER_HINT);
    }
    const footnotes = container.querySelectorAll(".placeholder-footnote");
    expect(footnotes).toHaveLength(1);
    expect(footnotes[0]).toHaveTextContent(`${PLACEHOLDER_MARK} ${PLACEHOLDER_FOOTNOTE}`);
    // No pill: the word "placeholder" is never shown as a visible tag.
    expect(screen.queryByText("placeholder")).toBeNull();
    expect(container.querySelector(".placeholder-badge")).toBeNull();
  });

  it("renders no mark, no hint and no footnote once the links are real (task 17.3)", () => {
    const real = {
      demo: { ...LINKS.demo, href: "https://www.youtube.com/watch?v=example", placeholder: false },
      github: { ...LINKS.github, href: "https://github.com/example/timewraith", placeholder: false },
    };
    const { container } = render(<Cta links={real} />);
    for (const [name, href] of [
      [CTA_DEMO, real.demo.href],
      [CTA_GITHUB, real.github.href],
    ] as const) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveTextContent(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
      expect(link).not.toHaveAttribute("aria-describedby");
    }
    expect(container.querySelector(".footnote-mark")).toBeNull();
    expect(container.querySelector(".placeholder-footnote")).toBeNull();
    expect(container.textContent).not.toContain(PLACEHOLDER_MARK);
    expect(container.textContent).not.toContain(PLACEHOLDER_FOOTNOTE);
    expect(container.textContent).not.toContain(PLACEHOLDER_HINT);
  });

  it("shows the footnote when only one of the two links is still a placeholder", () => {
    const { container } = render(<Cta links={{ demo: { ...LINKS.demo, placeholder: false }, github: LINKS.github }} />);
    expect(container.querySelectorAll(".footnote-mark")).toHaveLength(2); // one on GitHub, one in the footnote
    expect(screen.getByRole("link", { name: CTA_DEMO }).querySelector(".footnote-mark")).toBeNull();
    expect(container.querySelectorAll(".placeholder-footnote")).toHaveLength(1);
  });
});

// Vitest runs with css: false, so the stylesheets are read from disk.
const readCss = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const baseCss = readCss("../../styles/base.css");
const tokensCss = readCss("../../styles/tokens.css");

describe("primary CTA contrast rule (decision D7)", () => {
  const rule = /\.btn--primary\s*\{([^}]*)\}/.exec(baseCss)?.[1] ?? "";

  it("uses a bold label of at least 18.66px", () => {
    expect(rule).toMatch(/font-weight:\s*700/);
    const sizeToken = /font-size:\s*var\((--[\w-]+)\)/.exec(rule)?.[1];
    expect(sizeToken).toBe("--text-cta");
    const rem = Number(new RegExp(`${sizeToken}:\\s*([\\d.]+)rem`).exec(tokensCss)?.[1]);
    expect(rem * 16).toBeGreaterThanOrEqual(18.66);
  });

  it("has a 2px ink-900 border on pumpkin-600 with ink-900 text", () => {
    expect(rule).toMatch(/border:\s*var\(--border-ink\)/);
    expect(tokensCss).toMatch(/--border-ink:\s*2px solid var\(--ink-900\)/);
    expect(rule).toMatch(/background:\s*var\(--pumpkin-600\)/);
    expect(rule).toMatch(/(?<!-)color:\s*var\(--ink-900\)/);
  });
});
