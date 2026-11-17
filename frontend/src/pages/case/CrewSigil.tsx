import type { MascotId } from "../../mascots/ids";

// Line art sized for the case board, with motifs from each member's role.
const CREW_MARKS: Partial<Record<MascotId, string>> = {
  "wraith-director": "M18 35v-8a14 14 0 0 1 28 0v8l-5-3-4 4-5-4-5 4-4-4zM28 25h1m6 0h1",
  "watchtower-warden": "M23 39V25l-4-5v-5h7v5h12v-5h7v5l-4 5v14zM29 39v-9h6v9",
  "bat-scout": "M32 38c-2-5-6-9-12-9l-5-12 13 7 2-5 2 4 2-4 2 5 13-7-5 12c-6 0-10 4-12 9Z",
  "pumpkin-mechanic": "M31 18c0-4 2-6 5-6m-4 7c-7-5-16 1-16 9s8 14 16 10c8 4 16-2 16-10s-9-14-16-9Zm-9 8 4-3 1 5Zm18 0-4-3-1 5Zm-13 7h8",
  "spider-weaver": "M32 13v6m0 12v7m-5-15-7-5-4 2m11 7-9-3-4 4m13 3-9 3-2 5m12-6-5 5-1 5m15-20 7-5 4 2m-11 7 9-3 4 4m-13 3 9 3 2 5m-12-6 5 5 1 5M27 27a5 8 0 1 1 10 0 5 8 0 1 1-10 0Z",
  "raven-archivist": "M21 39c2-8 5-12 10-14 1-7 7-10 12-7l6 5-7 2c-1 8-8 13-21 14Zm4 0-5 4m18-21h1",
  "doctor-stitch": "M20 38 39 18c5-5 10 1 5 5L24 42l-4 1Zm16-17 5 4m-19-3 5 5m-2-9 5 5m6 12 5 5m-2-8 5 5",
  "gargoyle-gatekeeper": "M18 38V27l-3-9 12 5h10l12-5-3 9v11H18Zm7-8 4 2m10-2-4 2m-7 6 4-4 4 4",
  "cauldron-cat": "M19 28V14l10 7h6l10-7v14m-22 7h18m-22-7c0 10 5 13 13 13s13-3 13-13m-19-1h1m10 0h1",
  "skeleton-scribe": "M22 17h20v22H22zM27 23h10m-10 5h10m-10 5h6m-9-16v-4h20v22h-2",
};

export function CrewSigil({ id, active = false }: { readonly id: MascotId; readonly active?: boolean }) {
  return (
    <svg className="crew-sigil" data-active={active} viewBox="0 0 64 64" aria-hidden="true" focusable="false" fill="none">
      <path className="crew-sigil__shield" d="M32 3 56 14v21c0 11-11 21-24 26C19 56 8 46 8 35V14Z" />
      <path className="crew-sigil__rim" d="M32 8 51 17v18c0 9-8 17-19 22-11-5-19-13-19-22V17Z" />
      <path className="crew-sigil__mark" d={CREW_MARKS[id] ?? "M20 29a12 12 0 1 1 24 0 12 12 0 1 1-24 0Zm12-7v7l5 3"} />
      <path className="crew-sigil__needle" d="M32 48v-5m-2 5h4" />
    </svg>
  );
}
