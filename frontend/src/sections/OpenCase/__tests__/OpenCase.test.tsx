import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetProvider } from "../../../assets/AssetProvider";
import { loadBundledManifest } from "../../../assets/manifest";
import { CHECKLIST_LABEL, HEADLINE } from "../../../content/copy";
import { OpenCase } from "../OpenCase";

describe("Open-a-case composition (was the Hero, pass B)", () => {
  it("has the one h1 with the exact headline, read before the stage", () => {
    const { container } = render(<OpenCase />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(h1).toHaveTextContent(HEADLINE);
    const stage = container.querySelector(".hero__stage") as HTMLElement;
    expect(h1.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the Wraith Director and the Watchtower Warden, and hides the decorative Mini Bat", () => {
    const { container } = render(<OpenCase />);
    expect(screen.getByRole("img", { name: "Wraith Director" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Watchtower Warden" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Mini Bat" })).toBeNull();
    expect(container.querySelector('.hero__bat [data-mascot="mini-bat"]')).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the Clock reading 23:59 with both separate hand hooks", () => {
    const { container } = render(<OpenCase />);
    const clock = screen.getByRole("img", { name: "Tower clock reading 23:59" });
    expect(clock).toHaveAttribute("data-clock-time", "23:59");
    expect(container.querySelector('#hero-clock [data-clock-hand="hour"]')).not.toBeNull();
    expect(container.querySelector('#hero-clock [data-clock-hand="minute"]')).not.toBeNull();
  });

  it("puts the Warden behind the pinned notice board, which keeps its simulated-status heading", () => {
    const { container } = render(<OpenCase />);
    const notice = container.querySelector(".hero__notice") as HTMLElement;
    const warden = notice.querySelector('[data-hero-figure="watchtower-warden"]') as HTMLElement;
    const board = within(notice).getByRole("region", { name: CHECKLIST_LABEL });
    expect(warden.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(board.style.getPropertyValue("--tilt")).toMatch(/deg$/);
  });

  it("draws the real Wraith pose with the bundled manifest, eager, in a reserved box anchored at its feet", () => {
    const urls = (rel: string) => `/assets/${rel}`;
    const { container } = render(
      <AssetProvider manifest={loadBundledManifest()} resolveUrl={urls}>
        <OpenCase />
      </AssetProvider>,
    );
    const img = container.querySelector('.hero__wraith img[data-mascot="wraith-director"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("data-art", "pose");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("width", "640");
    expect(img).toHaveAttribute("height", "800");
    expect(img.style.aspectRatio).toBe("640 / 800");
    expect(img.style.objectPosition).toBe("50% 100%");
    expect(img.getAttribute("alt")).toMatch(/^Wraith Director/);
  });
});
