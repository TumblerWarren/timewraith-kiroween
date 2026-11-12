import { describe, expect, it } from "vitest";
import { caseHref, href, parseHash } from "../router";

describe("hash routes", () => {
  it("parses every page, case tabs and unknown paths", () => {
    expect(parseHash("")).toEqual({ page: "home" });
    expect(parseHash("#/")).toEqual({ page: "home" });
    expect(parseHash("#/cases")).toEqual({ page: "cases" });
    expect(parseHash("#/new")).toEqual({ page: "new" });
    expect(parseHash("#/crew")).toEqual({ page: "crew" });
    expect(parseHash("#/about")).toEqual({ page: "about" });
    expect(parseHash("#/cases/abc")).toEqual({ page: "case", id: "abc", tab: "overview" });
    expect(parseHash("#/cases/abc/fixes")).toEqual({ page: "case", id: "abc", tab: "fixes" });
    expect(parseHash("#/cases/abc/nope")).toEqual({ page: "not-found", path: "cases/abc/nope" });
    expect(parseHash("#main")).toEqual({ page: "not-found", path: "main" });
  });

  it("round-trips case links, including ids that need escaping", () => {
    expect(caseHref("7bd6dc7c")).toBe("#/cases/7bd6dc7c");
    expect(caseHref("a b", "plan")).toBe("#/cases/a%20b/plan");
    expect(parseHash(caseHref("a b", "plan"))).toEqual({ page: "case", id: "a b", tab: "plan" });
    expect(href({ page: "home" })).toBe("#/");
  });
});
