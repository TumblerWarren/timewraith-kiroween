import { render, screen } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ReduceMotionProvider } from "../a11y/ReduceMotionProvider";
import { App } from "../App";

describe("scaffold smoke test", () => {
  it("renders the headline inside main", () => {
    render(
      <ReduceMotionProvider>
        <App />
      </ReduceMotionProvider>,
    );
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Bugs are hiding in time." })).toBeInTheDocument();
  });

  it("runs property tests (fast-check is wired)", () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a));
  });
});
