import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Mascot } from "../../mascots/Mascot";
import { MASCOT_ART } from "../../mascots/roster";
import {
  PLACEHOLDER_FOOTNOTE,
  PLACEHOLDER_HINT,
  PLACEHOLDER_MARK,
  PlaceholderFootnote,
  PlaceholderLink,
} from "../../components/PlaceholderBadge";
import { LINKS } from "../../config/links";
import { AssetProvider } from "../AssetProvider";
import { Art } from "../Art";
import { EMPTY_MANIFEST, type Manifest } from "../manifest";

const poseId = MASCOT_ART["raven-archivist"].pose;
const withPose = (alt?: string | null): Manifest => ({
  ...EMPTY_MANIFEST,
  assets: {
    [poseId]: { id: poseId, kind: "pose", status: "pass", files: { webp: "cutouts/raven-archivist/pose.webp" }, ...(alt !== undefined ? { alt } : {}) },
  },
});
const resolveUrl = (p: string) => `/served/${p}`;

describe("Art", () => {
  it("draws the placeholder with the real name when there is no manifest and no provider", () => {
    render(<Art mascot="wraith-director" width={80} height={100} />);
    const svg = screen.getByRole("img", { name: "Wraith Director" });
    expect(svg).toHaveAttribute("data-art", "placeholder");
    expect(svg).toHaveAttribute("width", "80");
    expect(svg).toHaveAttribute("height", "100");
  });

  it("uses the pose image with reserved width and height, and lazy loading by default", () => {
    render(
      <AssetProvider manifest={withPose()} resolveUrl={resolveUrl}>
        <Art mascot="raven-archivist" width={90} height={101} />
      </AssetProvider>,
    );
    const img = screen.getByRole("img", { name: "Raven Archivist" });
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "/served/cutouts/raven-archivist/pose.webp");
    expect(img).toHaveAttribute("width", "90");
    expect(img).toHaveAttribute("height", "101");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("loads eagerly only when asked (Hero)", () => {
    render(
      <AssetProvider manifest={withPose()} resolveUrl={resolveUrl}>
        <Art mascot="raven-archivist" width={90} height={101} eager />
      </AssetProvider>,
    );
    expect(screen.getByRole("img")).toHaveAttribute("loading", "eager");
  });

  it("gives decorative art alt=\"\" and informative art alt text", () => {
    const { container, rerender } = render(
      <AssetProvider manifest={withPose()} resolveUrl={resolveUrl}>
        <Art mascot="raven-archivist" width={90} height={101} decorative />
      </AssetProvider>,
    );
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    rerender(
      <AssetProvider manifest={withPose("Raven with a stamp")} resolveUrl={resolveUrl}>
        <Art mascot="raven-archivist" width={90} height={101} />
      </AssetProvider>,
    );
    expect(screen.getByRole("img", { name: "Raven with a stamp" })).toBeInTheDocument();
  });

  it("hides the placeholder from assistive technology when decorative", () => {
    const { container } = render(<Art mascot="mini-bat" width={50} height={40} decorative />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });

  it("falls back to the placeholder when a passing pose has no served file, or the pose failed", () => {
    const failed: Manifest = { ...EMPTY_MANIFEST, assets: { [poseId]: { id: poseId, kind: "pose", status: "fail", qa: { ok: false, reasons: ["fringe"] } } } };
    const { container, rerender } = render(
      <AssetProvider manifest={withPose()} resolveUrl={() => undefined}>
        <Art mascot="raven-archivist" width={90} height={101} />
      </AssetProvider>,
    );
    expect(container.querySelector("svg")).toHaveAttribute("data-art", "placeholder");
    rerender(
      <AssetProvider manifest={failed} resolveUrl={resolveUrl}>
        <Art mascot="raven-archivist" width={90} height={101} />
      </AssetProvider>,
    );
    expect(container.querySelector("svg")).toHaveAttribute("data-art", "placeholder");
  });
});

describe("Mascot", () => {
  it("reserves the roster size and keeps the aspect for a custom width", () => {
    const { container } = render(<Mascot id="watchtower-warden" />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "140");
    expect(container.querySelector("svg")).toHaveAttribute("height", "220");
    const { container: c2 } = render(<Mascot id="watchtower-warden" width={70} />);
    expect(c2.querySelector("svg")).toHaveAttribute("height", "110");
  });
});

describe("PlaceholderLink", () => {
  it("marks a placeholder link with a visible footnote dagger and an aria-describedby hint", () => {
    render(<PlaceholderLink link={LINKS.demo} />);
    const link = screen.getByRole("link", { name: LINKS.demo.label });
    expect(within(link).getByText(PLACEHOLDER_MARK)).toBeVisible();
    expect(link).toHaveAccessibleDescription(PLACEHOLDER_HINT);
  });

  it("renders a real link with no mark and no hint", () => {
    const { container } = render(<PlaceholderLink link={LINKS.issue7998}>Issue 7998</PlaceholderLink>);
    const link = screen.getByRole("link", { name: "Issue 7998" });
    expect(link).not.toHaveAttribute("aria-describedby");
    expect(link).toHaveTextContent(/^Issue 7998$/);
    expect(container.querySelector(".footnote-mark")).toBeNull();
    expect(container.textContent).not.toContain(PLACEHOLDER_HINT);
  });

  it("renders the shared footnote only while a link in the group is a placeholder", () => {
    const { container, rerender } = render(<PlaceholderFootnote links={[LINKS.issue7998, LINKS.demo]} />);
    expect(container).toHaveTextContent(`${PLACEHOLDER_MARK} ${PLACEHOLDER_FOOTNOTE}`);
    rerender(<PlaceholderFootnote links={[LINKS.issue7998, { ...LINKS.demo, placeholder: false }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
