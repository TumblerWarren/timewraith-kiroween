import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../client";

afterEach(() => vi.unstubAllGlobals());

describe("Fix branch and GitHub API", () => {
  it("uses the branch, preview and sharing endpoints with the confirmed branch in the write requests", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "{}" });
    vi.stubGlobal("fetch", fetch);
    const api = createApi("/api/v1");
    const bug = "/api/v1/investigations/case%2F1/bugs/bug%2F1";
    const branch = "timewraith/fix-clock";
    const headers = { "X-TimeWraith": "1" };
    const jsonHeaders = { ...headers, "Content-Type": "application/json" };

    expect(api.branchPatchUrl("case/1", "bug/1")).toBe(`${bug}/branch.patch`);
    await api.makeBranch("case/1", "bug/1");
    await api.githubPreview("case/1", "bug/1");
    await api.prepareContribution("case/1", "bug/1");
    await api.githubPush("case/1", "bug/1", branch, true);
    await api.githubPullRequest("case/1", "bug/1", "Subject", "Description", branch, false);
    await api.githubUpdate("case/1", "bug/1", "Edited subject", "Edited description", branch);
    await api.githubStart();
    await api.githubLogin();
    await api.githubCancel();
    await api.githubLogout();
    expect(fetch.mock.calls).toEqual([
      [`${bug}/branch`, { method: "POST", headers }],
      [`${bug}/github`, { headers: {} }],
      [`${bug}/contribution`, { method: "POST", headers }],
      [`${bug}/github/push`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ confirm_branch: branch, acknowledge_duplicates: true }) }],
      [`${bug}/github/pull-request`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ title: "Subject", body: "Description", confirm_branch: branch, acknowledge_duplicates: false }) }],
      [`${bug}/github/update`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ title: "Edited subject", body: "Edited description", confirm_branch: branch }) }],
      ...["start", "login", "login/cancel", "logout"].map((path) => [`/api/v1/system/github/${path}`, { method: "POST", headers }]),
    ]);
  });
});
