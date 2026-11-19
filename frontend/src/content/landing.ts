export const LANDING_STAGES = [
  {
    "label": "Clone",
    "kicker": "01 / REPOSITORY",
    "title": "Know what you’re investigating.",
    "copy": "Resolve the requested branch or commit, inspect the project and identify its test setup. The crew works against a pinned revision so results can be reproduced.",
    "file": "repository / manifest",
    "code": "ref     main\ncommit  a91c2f7\nfile    src/session.ts\ntests   tests/session.test.ts",
    "note": "Pinned revision · no live repository connected"
  },
  {
    "label": "Analyze",
    "kicker": "02 / DISCOVERY",
    "title": "Follow the time-sensitive code.",
    "copy": "Bat Scout identifies clock reads, scheduling and expiry logic. A candidate is linked to its exact source location before a test is designed.",
    "file": "src/session.ts:42",
    "code": "function isExpired(now, expiresAt) {\n  return now > expiresAt;\n}",
    "note": "Candidate: equality at the expiry boundary"
  },
  {
    "label": "Test",
    "kicker": "03 / REPRODUCTION",
    "title": "Make the bug happen on demand.",
    "copy": "The crew sweeps controlled clock settings, repeats selected violations and checks a reproduction before reporting a defect.",
    "file": "tests/session.test.ts",
    "code": "expect(isExpired(1000, 1000))\n  .toBe(true);\n\n// Expected: true\n// Received: false",
    "note": "Example failure · at now === expiresAt"
  },
  {
    "label": "Fix",
    "kicker": "04 / REPAIR",
    "title": "Change only what is necessary.",
    "copy": "Doctor Stitch proposes a patch after a defect is reproduced. Review the evidence and accept or reject a fix that passes verification.",
    "file": "src/session.ts:42 · proposed diff",
    "code": "- return now > expiresAt;\n+ return now >= expiresAt;",
    "note": "Illustrative patch · review before applying"
  },
  {
    "label": "Verify",
    "kicker": "05 / VERIFICATION",
    "title": "Prove the fix holds.",
    "copy": "A proposed fix must pass eight gates, including the original reproduction, regression checks and independent review. Accepted fixes can be checked against repository rules and shared on GitHub.",
    "file": "tests/session.test.ts · result",
    "code": "PASS  before expiry\nPASS  exactly at expiry\nPASS  after expiry",
    "note": "Illustrative results · not executed in this preview"
  }
] as const;

export const TIME_BUGS = [
  { title: "Daylight saving", copy: "Missing or repeated local hours." },
  { title: "Timezones", copy: "Local dates versus UTC boundaries." },
  { title: "Expiry & scheduling", copy: "Off-by-one errors at deadlines." },
  { title: "Clock drift", copy: "Wall-clock jumps and elapsed time." },
] as const;
