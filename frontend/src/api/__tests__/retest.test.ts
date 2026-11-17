import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApi } from "../client";

afterEach(() => vi.unstubAllGlobals());

describe("retest API", () => {
  it("sends the ref as JSON with the local-action header and safely encodes identifiers", async () => {
    const result = { ref: "pull/453", revision: "abcdef", at: "2026-11-16T10:00:00Z", outcome: "fixed", detail: "Passed three times." };
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(result) });
    vi.stubGlobal("fetch", fetch);
    expect(await createApi("/api/v1").retest("case/id", "bug/id", "pull/453")).toEqual(result);
    expect(fetch).toHaveBeenCalledWith("/api/v1/investigations/case%2Fid/bugs/bug%2Fid/retest", {
      method: "POST", body: JSON.stringify({ ref: "pull/453" }), headers: { "X-TimeWraith": "1", "Content-Type": "application/json" },
    });
  });

  it("preserves backend error codes and messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => JSON.stringify({ error: { code: "busy", message: "The case is still running." } }) }));
    await expect(createApi().retest("case", "bug", "master")).rejects.toEqual(new ApiError("busy", "The case is still running."));
  });
});
