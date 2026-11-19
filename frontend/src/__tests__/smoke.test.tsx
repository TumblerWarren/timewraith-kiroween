import { cleanup, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { ReduceMotionProvider } from "../a11y/ReduceMotionProvider";
import { App } from "../App";

const renderAt = (hash: string) => {
  window.location.hash = hash;
  return render(
    <ReduceMotionProvider>
      <App />
    </ReduceMotionProvider>,
  );
};

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("app shell smoke test", () => {
  it("renders the home page inside main with one h1", () => {
    renderAt("#/home");
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Hunt the bugs that hide in time." })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Crew setup" })).toHaveAttribute("href", "#/crew");
  });

  it.each([
    ["#/", "TimeWraith · The midnight hour"],
    ["#/crew", "Set up the Crew on this machine"],
    ["#/about", "How TimeWraith works"],
    ["#/nowhere", "Page not found"],
  ])("renders %s with its own heading", (hash, title) => {
    renderAt(hash);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each(["#/new", "#/cases", "#/cases/example"])("locks %s until Crew readiness is confirmed", (hash) => {
    renderAt(hash);
    expect(screen.getByRole("heading", { level: 1, name: "Complete Crew setup" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Crew setup" })).toHaveAttribute("href", "#/crew");
  });

  it("runs property tests (fast-check is wired)", () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a));
  });
});
