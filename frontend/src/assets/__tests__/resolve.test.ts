import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MASCOT_IDS } from "../../mascots/ids";
import { MASCOT_ART } from "../../mascots/roster";
import {
  assertManifest,
  EMPTY_MANIFEST,
  loadBundledManifest,
  manifestProblems,
  normalizeManifest,
  type AssetEntry,
  type Manifest,
} from "../manifest";
import { resolveMascotArt } from "../resolve";

const entry = (id: string, status: AssetEntry["status"]): AssetEntry => ({
  id,
  kind: "part",
  status,
  ...(status === "fail" ? { qa: { ok: false, reasons: ["fringe"] } } : {}),
});

const manifestOf = (statuses: Record<string, AssetEntry["status"]>): Manifest => ({
  ...EMPTY_MANIFEST,
  assets: Object.fromEntries(Object.entries(statuses).map(([id, s]) => [id, entry(id, s)])),
});

const allAssetIds = MASCOT_IDS.flatMap((id) => [...MASCOT_ART[id].rig, MASCOT_ART[id].pose]);

describe("resolveMascotArt", () => {
  it("gives placeholder for every mascot when the manifest is empty, missing or malformed", () => {
    for (const id of MASCOT_IDS) {
      expect(resolveMascotArt(id, EMPTY_MANIFEST)).toBe("placeholder");
      expect(resolveMascotArt(id, null)).toBe("placeholder");
      expect(resolveMascotArt(id, undefined)).toBe("placeholder");
      expect(resolveMascotArt(id, {} as Manifest)).toBe("placeholder");
    }
  });

  it("falls back rig, then pose, then placeholder", () => {
    const { rig, pose } = MASCOT_ART["mini-bat"];
    const allPass = Object.fromEntries([...rig, pose].map((a) => [a, "pass" as const]));
    expect(resolveMascotArt("mini-bat", manifestOf(allPass))).toBe("rig");
    expect(resolveMascotArt("mini-bat", manifestOf({ ...allPass, [rig[1] as string]: "fail" }))).toBe("pose");
    expect(resolveMascotArt("mini-bat", manifestOf({ ...allPass, [rig[1] as string]: "fail", [pose]: "fail" }))).toBe("placeholder");
  });

  it("honours a status fail entry and a placeholder-status entry", () => {
    const pose = MASCOT_ART["gargoyle-gatekeeper"].pose;
    expect(resolveMascotArt("gargoyle-gatekeeper", manifestOf({ [pose]: "pass" }))).toBe("pose");
    expect(resolveMascotArt("gargoyle-gatekeeper", manifestOf({ [pose]: "fail" }))).toBe("placeholder");
    expect(resolveMascotArt("gargoyle-gatekeeper", manifestOf({ [pose]: "placeholder" }))).toBe("placeholder");
  });

  it("never returns rig for a Tier 2 mascot (no rig parts)", () => {
    const pose = MASCOT_ART["two-faced-jack"].pose;
    expect(resolveMascotArt("two-faced-jack", manifestOf({ [pose]: "pass" }))).toBe("pose");
  });

  it("covers Doctor Stitch: the bundled manifest's doctor-stitch rig parts all pass, so it resolves to rig", () => {
    expect(resolveMascotArt("doctor-stitch", EMPTY_MANIFEST)).toBe("placeholder");
    expect(resolveMascotArt("doctor-stitch", loadBundledManifest())).toBe("rig");
  });

  it("does not throw for an unknown id", () => {
    expect(resolveMascotArt("nope" as never, EMPTY_MANIFEST)).toBe("placeholder");
  });

  /** Feature: timewraith, Property 21: Mascot art resolution is total. **Validates: Requirements 4.8, 14.2** */
  it("Property 21: total, never throws, rig only when every rig part passes", () => {
    const status = fc.constantFrom<AssetEntry["status"] | "missing">("pass", "fail", "missing");
    fc.assert(
      fc.property(fc.array(status, { minLength: allAssetIds.length, maxLength: allAssetIds.length }), (statuses) => {
        const picked: Record<string, AssetEntry["status"]> = {};
        allAssetIds.forEach((assetId, i) => {
          const s = statuses[i];
          if (s && s !== "missing") picked[assetId] = s;
        });
        const manifest = manifestOf(picked);
        for (const id of MASCOT_IDS) {
          const level = resolveMascotArt(id, manifest);
          expect(["rig", "pose", "placeholder"]).toContain(level);
          const { rig, pose } = MASCOT_ART[id];
          const rigOk = rig.length > 0 && rig.every((a) => picked[a] === "pass");
          expect(level === "rig").toBe(rigOk);
          if (level === "pose") expect(picked[pose]).toBe("pass");
          if (!rigOk && picked[pose] === "pass") expect(level).toBe("pose");
        }
      }),
    );
  });
});

describe("Asset_Manifest types", () => {
  it("accepts an empty manifest", () => {
    expect(() => assertManifest(EMPTY_MANIFEST)).not.toThrow();
    expect(normalizeManifest(undefined)).toBe(EMPTY_MANIFEST);
  });

  it("reports a failed entry without a reason, and bad pivots or sizes", () => {
    const bad = { schemaVersion: 1, keyColor: "#FF00FF", assets: { a: { id: "a", kind: "part", status: "fail" }, b: { id: "b", kind: "part", status: "pass", size: { w: "x" } } } };
    const problems = manifestProblems(bad);
    expect(problems.some((p) => p.startsWith("a:"))).toBe(true);
    expect(problems.some((p) => p.startsWith("b:"))).toBe(true);
    expect(() => assertManifest(bad)).toThrow();
  });

  it("normalizeManifest drops unusable entries and keeps the rest", () => {
    const m = normalizeManifest({
      assets: { good: { kind: "pose", status: "pass" }, junk: 5, wrong: { kind: "pose", status: "great" } },
    });
    expect(Object.keys(m.assets)).toEqual(["good"]);
    expect(m.assets["good"]?.id).toBe("good");
  });
});
