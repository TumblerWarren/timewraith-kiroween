import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReduceMotionProvider } from "../../a11y/ReduceMotionProvider";
import { App } from "../../App";
import { instantAnimator } from "../../animation/effects/animator";
import { DirectorProvider } from "../../animation/react/DirectorProvider";
import { CaseStoreProvider } from "../../cases/store";
import { SECTION_NODES } from "../../content/nodes";

// A failed GSAP chunk (thread scrub and sticky scenes) must leave a working, fully drawn board.
vi.mock("../../animation/scroll/loadScroll", async (orig) => ({
  ...(await orig<typeof import("../../animation/scroll/loadScroll")>()),
  loadScroll: () => Promise.reject(new Error("chunk failed")),
}));
vi.mock("../../animation/scroll/loadScenes", () => ({ loadScenes: () => Promise.reject(new Error("chunk failed")) }));

/** Task 11.6 (remaining items): node targets take focus, and the board survives a failed GSAP import. */
describe("Section_Node targets and a failed GSAP import", () => {
  it("each node's href targets a region whose heading has tabindex -1", () => {
    render(
      <ReduceMotionProvider>
        <App />
      </ReduceMotionProvider>,
    );
    for (const n of SECTION_NODES) {
      const region = document.getElementById(n.id);
      expect(region, n.id).not.toBeNull();
      const heading = region?.querySelector("h1, h2");
      expect(heading, n.id).toHaveAttribute("tabindex", "-1");
      expect(region).toHaveAttribute("aria-labelledby", heading?.id);
    }
  });

  it("falls back to the static thread and the static Lost Hour scene when the chunk fails", async () => {
    window.localStorage.setItem("tw.reduceMotion", "off");
    render(
      <ReduceMotionProvider>
        <DirectorProvider animator={instantAnimator}>
          <CaseStoreProvider storage={null}>
            <App />
          </CaseStoreProvider>
        </DirectorProvider>
      </ReduceMotionProvider>,
    );
    // jsdom has no layout, so the thread SVG itself is not drawn here; the board must still render and stay static.
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => expect(screen.getByRole("img", { name: "Tower clock reading 01:59" })).toBeInTheDocument());
    expect(document.querySelector(".problem__scene")).toHaveAttribute("data-frame", "static");
    expect(document.querySelectorAll("main > section")).toHaveLength(7);
    window.localStorage.clear();
  });
});
