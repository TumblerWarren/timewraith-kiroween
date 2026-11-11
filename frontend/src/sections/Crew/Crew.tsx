import type { CSSProperties } from "react";
import { useId } from "react";
import { paperTilt } from "../../components/tilt";
import { CREW, crewByKind, type CrewMember, type MascotId } from "../../content/crew";
import { CREW_HEADING, CREW_INTRO, CREW_TIERS, crewReactLabel, type CrewTierDef } from "../../content/sections";
import { TIER1_HOVER, TIER2_REACTIONS } from "../../animation/react/regionCast";
import { useEffectTrigger } from "../../animation/react/useEffectTrigger";
import { Mascot } from "../../mascots/Mascot";

/**
 * Where each of the 14 stands in the group portrait. Values are CSS px on a reference stage (wide: 1088 x 620,
 * compact: 320 x 600) and are turned into percentages, so the whole picture scales with its width.
 * [x of the left edge, y of the bottom edge (from the stage floor), width, stacking order].
 * The number tag sits at [nx, ny] percent of the figure box (from its top left), default the top left corner.
 */
type Spot = readonly [x: number, y: number, w: number, z: number];
interface Sitter {
  readonly wide: Spot;
  readonly compact: Spot;
  readonly tag?: readonly [nx: number, ny: number];
  /** Number tag position in the compact picture, when it differs. */
  readonly ctag?: readonly [nx: number, ny: number];
}

const WIDE = { w: 1088, h: 620 } as const;
const COMPACT = { w: 320, h: 600 } as const;

const SITTERS: Readonly<Record<MascotId, Sitter>> = {
  "wraith-director": { wide: [168, 54, 300, 4], compact: [0, 44, 160, 4], tag: [10, 22] },
  "watchtower-warden": { wide: [94, 54, 170, 2], compact: [192, 264, 78, 2], tag: [6, 40] },
  "bat-scout": { wide: [250, 444, 180, 6], compact: [150, 426, 100, 6], tag: [70, 4] },
  "pumpkin-mechanic": { wide: [420, 54, 160, 5], compact: [180, 44, 92, 4], tag: [74, 8] },
  "raven-archivist": { wide: [930, 439, 150, 6], compact: [62, 452, 86, 6], tag: [70, 6] },
  "gargoyle-gatekeeper": { wide: [712, 264, 120, 4], compact: [146, 264, 56, 5], tag: [4, 6], ctag: [0, -10] },
  "cauldron-cat": { wide: [566, 54, 120, 6], compact: [140, 44, 70, 5], tag: [70, 4], ctag: [0, 0] },
  "spider-weaver": { wide: [596, 274, 92, 3], compact: [264, 400, 52, 3], tag: [72, 30], ctag: [-40, 30] },
  "mummy-wrapper": { wide: [866, 439, 92, 5], compact: [8, 452, 54, 4], tag: [4, 10] },
  "two-faced-jack": { wide: [828, 264, 100, 5], compact: [262, 264, 58, 3], tag: [70, 10], ctag: [40, -24] },
  "skeleton-scribe": { wide: [900, 4, 128, 1], compact: [262, 14, 64, 1], tag: [72, 4], ctag: [-4, -30] },
  "mini-bat": { wide: [118, 304, 64, 3], compact: [212, 380, 36, 3], tag: [-34, 6], ctag: [-70, -10] },
  "mini-ghost": { wide: [520, 330, 56, 3], compact: [104, 384, 32, 5], tag: [84, 0], ctag: [-70, 10] },
  // Decision D15: on the floor between the Cat and the Scribe, needle raised under the middle ledge.
  "doctor-stitch": { wide: [700, 54, 150, 5], compact: [16, 264, 80, 4], tag: [4, 8] },
};

/** Ledges the figures stand on: [x, y of the top edge, width] on the same reference stages. */
type Ledge = readonly [x: number, y: number, w: number];
const LEDGES: { readonly wide: readonly Ledge[]; readonly compact: readonly Ledge[] } = {
  wide: [
    [0, 54, WIDE.w],
    [690, 264, 360],
    [844, 439, 244],
  ],
  compact: [
    [0, 44, COMPACT.w],
    [0, 264, COMPACT.w],
    [0, 452, 160],
  ],
};

/** Spider Weaver's thread from the top of the stage down to its back: [x, length] on both stages. */
const THREAD = { wide: [642, 236], compact: [289, 140] } as const;

const pct = (n: number, of: number) => `${Math.round((n / of) * 10000) / 100}%`;

function sitterStyle(id: MascotId): CSSProperties {
  const { wide, compact, tag = [0, 0], ctag = tag } = SITTERS[id];
  return {
    "--x": pct(wide[0], WIDE.w),
    "--y": pct(wide[1], WIDE.h),
    "--w": pct(wide[2], WIDE.w),
    "--z": wide[3],
    "--cx": pct(compact[0], COMPACT.w),
    "--cy": pct(compact[1], COMPACT.h),
    "--cw": pct(compact[2], COMPACT.w),
    "--cz": compact[3],
    "--nx": `${tag[0]}%`,
    "--ny": `${tag[1]}%`,
    "--cnx": `${ctag[0]}%`,
    "--cny": `${ctag[1]}%`,
  } as CSSProperties;
}

function ledgeStyle(wide: Ledge, compact: Ledge | undefined): CSSProperties {
  return {
    "--x": pct(wide[0], WIDE.w),
    "--y": pct(wide[1], WIDE.h),
    "--w": pct(wide[2], WIDE.w),
    "--cx": compact ? pct(compact[0], COMPACT.w) : "0%",
    "--cy": compact ? pct(compact[1], COMPACT.h) : "0%",
    "--cw": compact ? pct(compact[2], COMPACT.w) : "0%",
  } as CSSProperties;
}

/** Key numbers follow the content order: agents 1 to 6, system components 7 to 12, companions 13 and 14. */
const NUMBER: Readonly<Record<MascotId, number>> = Object.fromEntries(CREW.map((m, i) => [m.id, i + 1])) as Record<
  MascotId,
  number
>;

/**
 * The group portrait. Every name and job is printed in the key, so the Tier 1 figures, the ledges and the number
 * tags are hidden from assistive technology and the art carries no alt text. The six Tier 2 figures are buttons
 * (the design's "six extra tab stops") named "{name}, play reaction"; their art stays decorative inside.
 * `data-react-actor` / `data-react-pose` let BoardMotion send `mascot.hover` on pointer hover and on focus.
 */
function Portrait() {
  const request = useEffectTrigger();
  return (
    <div className="crew__portrait" data-crew-portrait="">
      {LEDGES.wide.map((l, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={i === 0 ? "crew__ledge crew__ledge--floor" : "crew__ledge"}
          style={{ ...ledgeStyle(l, LEDGES.compact[i]), ...paperTilt(`crew-ledge-${i}`, 0.6) }}
        />
      ))}
      <span
        aria-hidden="true"
        className="crew__thread"
        style={
          {
            "--x": pct(THREAD.wide[0], WIDE.w),
            "--h": pct(THREAD.wide[1], WIDE.h),
            "--cx": pct(THREAD.compact[0], COMPACT.w),
            "--ch": pct(THREAD.compact[1], COMPACT.h),
          } as CSSProperties
        }
      />
      {CREW.map((m) => {
        const reaction = TIER2_REACTIONS[m.id];
        const actor = `crew:${m.id}`;
        const props = {
          className: reaction ? "crew__sitter crew__sitter--tier2" : "crew__sitter",
          "data-sitter": m.id,
          "data-kind": m.kind,
          "data-tier": reaction ? "2" : "1",
          "data-react-actor": actor,
          "data-react-pose": reaction ?? TIER1_HOVER[m.id] ?? "wave",
          style: sitterStyle(m.id),
        };
        const inner = (
          <>
            <Mascot id={m.id} width={Math.round(SITTERS[m.id].wide[2])} decorative />
            <span className="crew__no paper-piece" aria-hidden="true" style={paperTilt(`crew-no-${m.id}`, 1.4, 2)}>
              {NUMBER[m.id]}
            </span>
          </>
        );
        return reaction ? (
          <button key={m.id} type="button" {...props} aria-label={crewReactLabel(m.name)} onClick={() => request("mascot.hover", { actor, pose: reaction })}>
            {inner}
          </button>
        ) : (
          <div key={m.id} {...props} aria-hidden="true">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function KeyEntry({ m }: { readonly m: CrewMember }) {
  return (
    <li className="crew__member" data-member={m.id}>
      <span className="crew__no crew__no--key paper-piece" style={paperTilt(`crew-no-${m.id}`, 1.4, 2)} aria-hidden="true">
        {NUMBER[m.id]}
      </span>
      <h4 className="crew__name">{m.name}</h4>
      <p className="crew__job">{m.job}</p>
    </li>
  );
}

function KeyGroup({ def }: { readonly def: CrewTierDef }) {
  const titleId = useId();
  return (
    <div className="crew__tier" data-tier={def.tier} role="group" aria-labelledby={titleId}>
      <h3 id={titleId} className="crew__tier-title">
        {def.title}
      </h3>
      <p className="crew__tier-note">{def.note}</p>
      <ul className="crew__members" role="list">
        {crewByKind(def.kind).map((m) => (
          <KeyEntry key={m.id} m={m} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Crew (region 5, dusk): all 14 mascots in one group portrait inside the tower, at three clearly different sizes, standing
 * on ledges, overlapping and peeking. Small inked numbers on the picture match a key below it, where each mascot's
 * name and one-line job are printed as text (Requirement 3.5), in three groups.
 * On enter the 14 check in one after another (`crew.rollcall`, sent by BoardMotion); the six Tier 2 figures are
 * buttons that react to hover, focus and Enter or Space, the Tier 1 figures react to hover only (task 14.8).
 */
export function Crew() {
  return (
    <section id="crew" className="section section--crew" aria-labelledby="crew-title">
      <div className="section__inner">
        <div className="rail" aria-hidden="true" data-thread-anchor="" />
        <div className="content">
          <div className="crew__intro">
            <h2 id="crew-title" tabIndex={-1}>
              {CREW_HEADING}
            </h2>
            <p>{CREW_INTRO}</p>
          </div>
          <Portrait />
          <div className="crew__key">
            {CREW_TIERS.map((def) => (
              <KeyGroup key={def.tier} def={def} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
