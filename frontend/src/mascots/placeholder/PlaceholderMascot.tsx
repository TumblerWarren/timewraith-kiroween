import { createContext, useContext, type ReactNode } from "react";
import { MASCOT_ART } from "../roster";
import type { MascotId } from "../ids";
import { CREW_BY_ID } from "../../content/crew";
import { inkPath, mapPoints, mirrorX, seededRandom, type InkPoint } from "./inkPath";

/**
 * Level 0 art (design: Fallback chain): one flat, hand-inked inline-SVG silhouette per mascot, filled
 * with palette tokens only. Every colour is a `var(--token)`, so no colour literal appears here. The
 * outlines are crooked on purpose: points are nudged by a seeded wobble (see inkPath.ts).
 *
 * With zero images on disk the whole page still builds and lays out with these (Requirements 4.8, 14.2).
 */

const INK = "var(--ink-900)";
const PAPER = "var(--paper-100)";
const PARCH = "var(--parchment-200)";
const MOON = "var(--moon-200)";
const MIST = "var(--mist-300)";
const STONE = "var(--divider-300)";
const WALNUT = "var(--walnut-700)";
const PUMPKIN = "var(--pumpkin-600)";
const GOLD = "var(--gold-500)";
const SAGE = "var(--sage-700)";
const BRICK = "var(--brick-700)";

const SW = 3;

/**
 * Ink weight of the current mascot (visual revision R1). Each mascot is drawn with its own pen: a seeded overall
 * weight, and each stroke varies a little more around it (seeded by the stroke's own seed), so no two outlines
 * have the same even line.
 */
const InkWeight = createContext(1);

function useStroke(sw: number, seed: number): number {
  const weight = useContext(InkWeight);
  const jitter = 0.85 + seededRandom(seed * 31 + 7)() * 0.3;
  return Math.round(sw * weight * jitter * 100) / 100;
}

/**
 * Two-plate misregistration, like a cheap print run: the colour plate is shifted 2 to 2.8 viewBox units from the
 * ink plate, in a direction seeded by the mascot id, so a sliver of fill escapes the outline on one side.
 */
export function misregistration(id: MascotId): { readonly dx: number; readonly dy: number; readonly weight: number } {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  const rand = seededRandom(h >>> 0);
  const angle = rand() * Math.PI * 2;
  const dist = id === "mummy-wrapper" ? 1.3 : 2 + rand() * 0.8;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { dx: r2(Math.cos(angle) * dist), dy: r2(Math.sin(angle) * dist), weight: r2(0.9 + rand() * 0.25) };
}

interface BlobProps {
  readonly pts: readonly InkPoint[];
  readonly fill?: string;
  readonly seed: number;
  readonly amp?: number;
  readonly sw?: number;
  readonly stroke?: string;
}

/** A closed, inked, filled shape. */
function Blob({ pts, fill = PAPER, seed, amp, sw = SW, stroke = INK }: BlobProps) {
  const width = useStroke(sw, seed);
  return (
    <path
      d={inkPath(pts, { seed, amp })}
      fill={fill}
      stroke={stroke}
      strokeWidth={width}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

interface LineProps {
  readonly pts: readonly InkPoint[];
  readonly stroke?: string;
  readonly sw?: number;
  readonly seed: number;
  readonly amp?: number;
}

/** An open inked stroke. */
function Line({ pts, stroke = INK, sw = 2.5, seed, amp = 0.8 }: LineProps) {
  const width = useStroke(sw, seed);
  return (
    <path
      d={inkPath(pts, { seed, amp, closed: false })}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

/** A thick limb: an ink stroke with a coloured stroke on top, so it reads as an outlined tube. */
function Limb({ pts, color, sw = 8, seed, amp = 1 }: { pts: readonly InkPoint[]; color: string; sw?: number; seed: number; amp?: number }) {
  return (
    <>
      <Line pts={pts} stroke={INK} sw={sw + 5} seed={seed} amp={amp} />
      <Line pts={pts} stroke={color} sw={sw} seed={seed} amp={amp} />
    </>
  );
}

/** A round eye: pale ball, ink pupil nudged toward `look`. */
function Eye({ cx, cy, r, look = [0, 0], ball = PAPER }: { cx: number; cy: number; r: number; look?: readonly [number, number]; ball?: string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={ball} stroke={INK} strokeWidth={2.5} />
      <circle cx={cx + look[0]} cy={cy + look[1]} r={r * 0.46} fill={INK} />
    </>
  );
}

// ---------------------------------------------------------------- the 14 silhouettes

const BAT_WING: readonly InkPoint[] = [
  [43, 40],
  [28, 29],
  [4, 22, 1],
  [13, 37],
  [8, 51, 1],
  [23, 46],
  [27, 61, 1],
  [39, 52],
];

function MiniBat() {
  return (
    <>
      <Blob pts={BAT_WING} fill={WALNUT} seed={11} />
      <Blob pts={mirrorX(BAT_WING, 50)} fill={WALNUT} seed={12} />
      <Line pts={[[43, 42], [20, 36], [8, 25]]} stroke={INK} sw={1.6} seed={13} />
      <Line pts={[[57, 42], [80, 36], [92, 25]]} stroke={INK} sw={1.6} seed={14} />
      <Blob pts={[[41, 38], [39, 16, 1], [50, 30]]} fill={WALNUT} seed={15} amp={0.8} />
      <Blob pts={[[59, 38], [62, 14, 1], [50, 30]]} fill={WALNUT} seed={16} amp={0.8} />
      <Blob pts={[[50, 29], [60, 35], [61, 50], [55, 63], [45, 63], [39, 50], [40, 35]]} fill={WALNUT} seed={17} />
      <Eye cx={45} cy={44} r={5} look={[1, 0.5]} ball={MOON} />
      <Eye cx={56} cy={43} r={4.2} look={[-1, 0.5]} ball={MOON} />
      <Blob pts={[[46, 55], [47.5, 61, 1], [50, 55]]} fill={PAPER} seed={18} amp={0.3} sw={1.5} />
      <Blob pts={[[52, 55], [54, 60, 1], [56, 54]]} fill={PAPER} seed={19} amp={0.3} sw={1.5} />
    </>
  );
}

function MiniGhost() {
  return (
    <>
      <Blob
        pts={[[50, 8], [74, 18], [84, 50], [83, 98], [72, 108, 1], [66, 94], [58, 112, 1], [49, 96], [40, 115, 1], [32, 97], [21, 108, 1], [16, 96], [15, 50], [26, 18]]}
        fill={MIST}
        seed={21}
        amp={1.8}
      />
      <Line pts={[[20, 56], [10, 66], [16, 78]]} stroke={INK} sw={2.5} seed={22} />
      <Blob pts={[[34, 40], [41, 38], [42, 56], [35, 58]]} fill={INK} seed={23} amp={0.8} sw={1} />
      <Blob pts={[[56, 36], [65, 33], [67, 55], [58, 57]]} fill={INK} seed={24} amp={0.8} sw={1} />
      <circle cx={38} cy={45} r={2} fill={PAPER} />
      <circle cx={61} cy={42} r={2.4} fill={PAPER} />
      <Blob pts={[[44, 72], [51, 68], [57, 74], [51, 81]]} fill={INK} seed={25} amp={0.8} sw={1} />
      <Blob pts={[[28, 66], [33, 64], [34, 69], [29, 70]]} fill={BRICK} seed={26} amp={0.3} sw={0} />
    </>
  );
}

function WraithDirector() {
  return (
    <>
      {/* the lantern arm, raised from behind the cloak edge, and the lantern held up beside the hood */}
      <Limb pts={[[106, 76], [124, 54], [136, 30]]} color={MIST} sw={9} seed={31} />
      <Line pts={[[137, 30], [137, 41]]} stroke={INK} sw={2} seed={32} />
      <Blob pts={[[127, 42], [147, 41], [149, 67], [125, 68]]} fill={GOLD} seed={33} amp={1} />
      <Blob pts={[[131, 62], [137, 47, 1], [143, 62]]} fill={PUMPKIN} seed={34} amp={0.6} sw={1.5} />
      <Line pts={[[137, 42], [137, 67]]} stroke={INK} sw={1.5} seed={35} amp={0.3} />
      <Line pts={[[126, 54], [148, 54]]} stroke={INK} sw={1.5} seed={36} amp={0.3} />
      {/* ragged cloak */}
      <Blob
        pts={[[80, 8], [104, 22], [111, 50], [102, 68], [120, 112], [134, 170], [118, 188, 1], [106, 170], [93, 196, 1], [79, 174], [65, 198, 1], [52, 174], [37, 190, 1], [34, 160], [47, 108], [58, 68], [49, 24]]}
        fill={MIST}
        seed={37}
        amp={2}
      />
      <Line pts={[[70, 120], [66, 160], [72, 182]]} stroke={WALNUT} sw={2} seed={38} />
      <Line pts={[[96, 118], [100, 150], [96, 176]]} stroke={WALNUT} sw={2} seed={39} />
      {/* hood opening with a crooked smile and gold eyes */}
      <Blob pts={[[80, 24], [98, 38], [97, 60], [80, 70], [63, 60], [62, 38]]} fill={INK} seed={40} amp={1.2} />
      <circle cx={72} cy={46} r={4.5} fill={GOLD} />
      <circle cx={90} cy={43} r={5.5} fill={GOLD} />
      <Line pts={[[70, 59], [80, 66], [92, 58]]} stroke={GOLD} sw={2.5} seed={41} />
    </>
  );
}

function WatchtowerWarden() {
  return (
    <>
      {/* searchlight wedge: flat, hard edged */}
      <path d="M52 57 L2 26 L2 90 Z" fill={MOON} fillOpacity={0.45} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
      <Blob pts={[[46, 72], [96, 70], [110, 206], [32, 210]]} fill={STONE} seed={51} amp={1.6} />
      {[[44, 100, 82, 98], [40, 126, 90, 124], [38, 152, 98, 150], [36, 178, 100, 176]].map(([x1, y1, x2, y2], i) => (
        <Line key={i} pts={[[x1 as number, y1 as number], [x2 as number, y2 as number]]} stroke={WALNUT} sw={2} seed={52 + i} />
      ))}
      <Line pts={[[66, 74], [64, 100]]} stroke={WALNUT} sw={2} seed={57} />
      <Line pts={[[74, 126], [72, 152]]} stroke={WALNUT} sw={2} seed={58} />
      <Blob pts={[[58, 210], [58, 184], [71, 172], [86, 184], [88, 210]]} fill={INK} seed={59} amp={1} />
      <Blob pts={[[40, 46], [98, 44], [102, 72], [36, 74]]} fill={WALNUT} seed={60} amp={1.4} />
      <Blob pts={[[32, 46], [68, 6, 1], [110, 46], [70, 40]]} fill={BRICK} seed={61} amp={1.4} />
      {/* the eye: lid, lamp iris */}
      <ellipse cx={70} cy={59} rx={20} ry={11} fill={PAPER} stroke={INK} strokeWidth={2.5} />
      <circle cx={72} cy={59} r={8} fill={GOLD} stroke={INK} strokeWidth={2} />
      <circle cx={73} cy={59} r={3.6} fill={INK} />
      <Line pts={[[46, 50], [62, 45], [92, 49]]} stroke={INK} sw={4} seed={62} />
    </>
  );
}

function BatScout() {
  const wing = mapPoints(BAT_WING, 1.7, 1.7, -4, -16);
  return (
    <>
      <Blob pts={wing} fill={WALNUT} seed={71} />
      <Blob pts={mirrorX(wing, 90)} fill={WALNUT} seed={72} />
      <Blob pts={[[78, 56], [74, 22, 1], [93, 48]]} fill={WALNUT} seed={73} amp={1} />
      <Blob pts={[[102, 56], [106, 20, 1], [91, 48]]} fill={WALNUT} seed={74} amp={1} />
      <Blob pts={[[90, 44], [106, 54], [108, 82], [98, 106], [82, 106], [72, 82], [74, 54]]} fill={WALNUT} seed={75} />
      {/* explorer scarf */}
      <Blob pts={[[74, 90], [106, 88], [112, 100], [100, 106], [80, 106], [72, 100]]} fill={BRICK} seed={76} amp={1} />
      <Blob pts={[[98, 104], [110, 128, 1], [106, 106]]} fill={BRICK} seed={77} amp={0.8} />
      {/* goggles pushed up on the brow */}
      <circle cx={82} cy={58} r={8} fill={MIST} stroke={INK} strokeWidth={2.5} />
      <circle cx={100} cy={57} r={8} fill={MIST} stroke={INK} strokeWidth={2.5} />
      <circle cx={82} cy={58} r={5.5} fill="none" stroke={GOLD} strokeWidth={2.5} />
      <circle cx={100} cy={57} r={5.5} fill="none" stroke={GOLD} strokeWidth={2.5} />
      <Eye cx={84} cy={74} r={5.5} look={[1.5, 0]} ball={MOON} />
      <Eye cx={98} cy={73} r={4.8} look={[1.5, 0]} ball={MOON} />
      <Blob pts={[[88, 84], [90, 91, 1], [93, 84]]} fill={PAPER} seed={78} amp={0.3} sw={1.5} />
    </>
  );
}

function PumpkinMechanic() {
  return (
    <>
      {/* stem and vine */}
      <Blob pts={[[78, 52], [76, 30], [90, 20, 1], [96, 34], [92, 54]]} fill={SAGE} seed={81} amp={1} />
      <Line pts={[[94, 34], [110, 26], [118, 36], [108, 42]]} stroke={SAGE} sw={3} seed={82} />
      {/* wrench */}
      <Blob pts={[[140, 96], [149, 92], [165, 148], [156, 152]]} fill={MIST} seed={83} amp={0.8} />
      <circle cx={145} cy={90} r={11} fill={MIST} stroke={INK} strokeWidth={3} />
      <Blob pts={[[140, 78], [146, 88], [152, 78]]} fill={INK} seed={84} amp={0.3} sw={1} />
      {/* pumpkin body */}
      <Blob
        pts={[[85, 52], [118, 56], [144, 86], [140, 126], [114, 148], [85, 152], [56, 148], [30, 126], [26, 86], [52, 56]]}
        fill={PUMPKIN}
        seed={85}
        amp={2}
      />
      <Line pts={[[85, 54], [66, 100], [85, 150]]} stroke={INK} sw={2} seed={86} />
      <Line pts={[[85, 54], [104, 100], [85, 150]]} stroke={INK} sw={2} seed={87} />
      <Line pts={[[54, 60], [36, 104], [56, 146]]} stroke={INK} sw={2} seed={88} />
      <Line pts={[[116, 60], [134, 104], [114, 146]]} stroke={INK} sw={2} seed={89} />
      {/* triangle eye and a gear eye */}
      <Blob pts={[[48, 80], [74, 86, 1], [56, 104, 1]]} fill={INK} seed={90} amp={0.6} sw={1.5} />
      <circle cx={106} cy={90} r={11} fill={GOLD} stroke={INK} strokeWidth={3} />
      <circle cx={106} cy={90} r={15} fill="none" stroke={INK} strokeWidth={4} strokeDasharray="4 5" />
      <circle cx={106} cy={90} r={4} fill={INK} />
      {/* toothy grin */}
      <Blob pts={[[58, 118], [68, 126, 1], [76, 117, 1], [86, 128, 1], [96, 118, 1], [106, 126, 1], [114, 116], [108, 134], [84, 140], [62, 134]]} fill={INK} seed={91} amp={0.5} sw={2} />
      <Blob pts={[[74, 120], [78, 128, 1], [82, 120]]} fill={PAPER} seed={92} amp={0.2} sw={1} />
    </>
  );
}

function RavenArchivist() {
  return (
    <>
      <Line pts={[[18, 164], [90, 168], [158, 160]]} stroke={WALNUT} sw={5} seed={101} />
      {/* tail feathers */}
      <Blob pts={[[104, 140], [150, 176, 1], [128, 178, 1], [138, 168], [112, 158]]} fill={WALNUT} seed={102} amp={1} />
      {/* body */}
      <Blob pts={[[74, 58], [112, 54], [134, 94], [124, 140], [98, 160], [68, 154], [58, 112]]} fill={WALNUT} seed={103} amp={1.8} />
      {/* wing */}
      <Blob pts={[[92, 80], [122, 90], [124, 138, 1], [108, 124], [96, 142, 1], [90, 112]]} fill={INK} seed={104} amp={1} />
      <Line pts={[[100, 96], [114, 106]]} stroke={MIST} sw={2} seed={105} />
      <Line pts={[[98, 110], [112, 122]]} stroke={MIST} sw={2} seed={106} />
      {/* head and beak */}
      <Blob pts={[[88, 18], [110, 28], [108, 54], [88, 64], [68, 54], [66, 30]]} fill={WALNUT} seed={107} amp={1.3} />
      <Blob pts={[[70, 34], [26, 50, 1], [70, 54]]} fill={GOLD} seed={108} amp={0.8} />
      <Line pts={[[70, 44], [38, 49]]} stroke={INK} sw={1.5} seed={109} amp={0.3} />
      {/* monocle */}
      <Eye cx={82} cy={38} r={6} look={[-1.5, 0]} ball={MOON} />
      <circle cx={82} cy={38} r={10} fill="none" stroke={GOLD} strokeWidth={2.5} />
      <Line pts={[[90, 46], [96, 62], [92, 76]]} stroke={GOLD} sw={1.5} seed={110} />
      {/* stamp held low */}
      <Blob pts={[[22, 138], [52, 138], [52, 156], [22, 156]]} fill={BRICK} seed={111} amp={1} />
      <Blob pts={[[30, 138], [32, 122], [44, 122], [46, 138]]} fill={STONE} seed={112} amp={0.8} />
      <Line pts={[[62, 156], [66, 166]]} stroke={GOLD} sw={3} seed={113} />
      <Line pts={[[84, 158], [86, 168]]} stroke={GOLD} sw={3} seed={114} />
    </>
  );
}

function GargoyleGatekeeper() {
  const wing: readonly InkPoint[] = [[60, 84], [34, 52], [12, 40, 1], [24, 72], [6, 96, 1], [30, 100], [28, 124, 1], [52, 118]];
  return (
    <>
      <Blob pts={wing} fill={WALNUT} seed={121} />
      <Blob pts={mirrorX(wing, 85)} fill={WALNUT} seed={122} />
      {/* crouched body */}
      <Blob pts={[[56, 92], [114, 90], [130, 138], [122, 172], [48, 174], [40, 138]]} fill={STONE} seed={123} amp={2} />
      <Blob pts={[[40, 160], [36, 176, 1], [58, 174]]} fill={STONE} seed={124} amp={0.6} />
      <Blob pts={[[130, 162], [136, 176, 1], [112, 174]]} fill={STONE} seed={125} amp={0.6} />
      {/* horns */}
      <Blob pts={[[62, 48], [46, 10, 1], [80, 40]]} fill={WALNUT} seed={126} amp={0.8} />
      <Blob pts={[[108, 48], [126, 14, 1], [92, 40]]} fill={WALNUT} seed={127} amp={0.8} />
      {/* head */}
      <Blob pts={[[60, 40], [86, 34], [112, 40], [118, 72], [100, 96], [72, 96], [54, 74]]} fill={STONE} seed={128} amp={1.6} />
      {/* angry brows, eyes, fanged mouth */}
      <Line pts={[[62, 52], [78, 62]]} stroke={INK} sw={5} seed={129} amp={0.4} />
      <Line pts={[[110, 48], [92, 62]]} stroke={INK} sw={5} seed={130} amp={0.4} />
      <circle cx={74} cy={68} r={5} fill={GOLD} stroke={INK} strokeWidth={2} />
      <circle cx={97} cy={67} r={5} fill={GOLD} stroke={INK} strokeWidth={2} />
      <Blob pts={[[70, 82], [100, 82], [96, 92], [74, 92]]} fill={INK} seed={131} amp={0.5} sw={2} />
      <Blob pts={[[74, 82], [77, 91, 1], [80, 82]]} fill={PAPER} seed={132} amp={0.2} sw={1} />
      <Blob pts={[[90, 82], [93, 91, 1], [96, 82]]} fill={PAPER} seed={133} amp={0.2} sw={1} />
      {/* crossed arms: "no entry" */}
      <Limb pts={[[52, 118], [86, 134], [120, 124]]} color={STONE} sw={11} seed={134} />
      <Limb pts={[[120, 112], [86, 126], [52, 140]]} color={STONE} sw={11} seed={135} />
    </>
  );
}

function CauldronCat() {
  return (
    <>
      {/* fire */}
      <Blob pts={[[44, 160], [50, 140, 1], [60, 158], [72, 134, 1], [84, 158], [98, 138, 1], [108, 158], [122, 142, 1], [130, 162]]} fill={PUMPKIN} seed={141} amp={1} />
      <Blob pts={[[66, 160], [74, 148, 1], [82, 160]]} fill={GOLD} seed={142} amp={0.6} sw={1.5} />
      {/* cauldron back rim and potion */}
      <ellipse cx={85} cy={92} rx={62} ry={11} fill={INK} />
      <ellipse cx={85} cy={92} rx={54} ry={7} fill={SAGE} />
      {/* the cat rising out of the pot */}
      <Blob pts={[[52, 96], [54, 62], [46, 24, 1], [70, 40], [98, 40], [124, 24, 1], [118, 62], [120, 96]]} fill={PUMPKIN} seed={143} amp={1.4} />
      <Blob pts={[[54, 36], [52, 30, 1], [66, 42]]} fill={BRICK} seed={144} amp={0.4} sw={1} />
      <Line pts={[[78, 44], [80, 54]]} stroke={INK} sw={2.5} seed={145} amp={0.3} />
      <Line pts={[[94, 44], [92, 54]]} stroke={INK} sw={2.5} seed={146} amp={0.3} />
      <ellipse cx={72} cy={66} rx={7} ry={8} fill={GOLD} stroke={INK} strokeWidth={2} />
      <ellipse cx={100} cy={65} rx={7} ry={8} fill={GOLD} stroke={INK} strokeWidth={2} />
      <ellipse cx={73} cy={66} rx={1.8} ry={6} fill={INK} />
      <ellipse cx={101} cy={65} rx={1.8} ry={6} fill={INK} />
      <Blob pts={[[82, 78], [90, 78], [86, 84]]} fill={BRICK} seed={147} amp={0.3} sw={1.5} />
      <Line pts={[[66, 82], [40, 76]]} stroke={INK} sw={1.5} seed={148} amp={0.3} />
      <Line pts={[[66, 86], [42, 90]]} stroke={INK} sw={1.5} seed={149} amp={0.3} />
      <Line pts={[[106, 82], [132, 76]]} stroke={INK} sw={1.5} seed={150} amp={0.3} />
      <Line pts={[[106, 86], [130, 90]]} stroke={INK} sw={1.5} seed={151} amp={0.3} />
      {/* pot body hides the lower cat */}
      <Blob pts={[[26, 94], [85, 104], [144, 94], [150, 128], [128, 154], [42, 154], [20, 128]]} fill={WALNUT} seed={152} amp={1.6} />
      <Line pts={[[30, 108], [85, 117], [140, 108]]} stroke={STONE} sw={3} seed={153} />
      <Line pts={[[36, 130], [44, 144]]} stroke={STONE} sw={2} seed={154} />
      {/* paws on the rim */}
      <Blob pts={[[50, 100], [66, 94], [72, 106], [54, 110]]} fill={PUMPKIN} seed={155} amp={0.6} sw={2.5} />
      <Blob pts={[[104, 106], [112, 94], [128, 100], [122, 110]]} fill={PUMPKIN} seed={156} amp={0.6} sw={2.5} />
      {/* bubbles */}
      <circle cx={28} cy={62} r={7} fill={SAGE} stroke={INK} strokeWidth={2.5} />
      <circle cx={142} cy={50} r={9} fill={SAGE} stroke={INK} strokeWidth={2.5} />
      <circle cx={150} cy={78} r={5} fill={SAGE} stroke={INK} strokeWidth={2.5} />
    </>
  );
}

function SpiderWeaver() {
  const legsLeft: readonly (readonly InkPoint[])[] = [
    [[66, 112], [34, 90], [10, 112], [14, 148]],
    [[64, 122], [26, 120], [6, 150], [16, 184]],
    [[66, 94], [40, 70], [14, 78], [8, 104]],
    [[70, 134], [40, 150], [30, 178], [44, 196]],
  ];
  return (
    <>
      <Line pts={[[80, 0], [80, 62]]} stroke={MIST} sw={2.5} seed={161} amp={0.6} />
      <Line pts={[[80, 22], [100, 16], [120, 26]]} stroke={MIST} sw={1.5} seed={162} />
      {legsLeft.map((leg, i) => (
        <Limb key={`l${i}`} pts={leg} color={WALNUT} sw={4} seed={163 + i} />
      ))}
      {legsLeft.map((leg, i) => (
        <Limb key={`r${i}`} pts={mirrorX(leg, 80)} color={WALNUT} sw={4} seed={170 + i} />
      ))}
      <Blob pts={[[80, 78], [112, 100], [118, 138], [96, 172], [64, 172], [42, 138], [48, 100]]} fill={WALNUT} seed={175} amp={2} />
      <Blob pts={[[80, 108], [90, 122], [80, 136], [70, 122]]} fill={BRICK} seed={176} amp={0.8} sw={1.5} />
      <Blob pts={[[80, 62], [98, 70], [98, 88], [80, 96], [62, 88], [62, 70]]} fill={WALNUT} seed={177} amp={1} />
      <Eye cx={73} cy={78} r={6} look={[1, 1]} ball={MOON} />
      <Eye cx={88} cy={77} r={5} look={[-1, 1]} ball={MOON} />
      <circle cx={80} cy={70} r={2.2} fill={GOLD} />
      <circle cx={67} cy={68} r={1.8} fill={GOLD} />
      <circle cx={93} cy={67} r={1.8} fill={GOLD} />
    </>
  );
}

const MUMMY_TORSO: readonly InkPoint[] = [[38, 70], [74, 64], [108, 70], [118, 128], [108, 184], [72, 188], [34, 184], [22, 128]];
const MUMMY_HEAD: readonly InkPoint[] = [[70, 8], [96, 20], [100, 50], [90, 66], [54, 66], [42, 50], [44, 22]];
const MUMMY_TRAIL: readonly InkPoint[] = [[108, 150], [122, 162], [112, 176], [118, 186]];

function MummyWrapper() {
  return (
    <>
      <defs>
        {/* Every wrapping band is clipped to the head and torso, so no stray ink leaves the outline. */}
        <clipPath id="mummy-body-clip" clipPathUnits="userSpaceOnUse">
          <path d={inkPath(MUMMY_TORSO, { seed: 182, amp: 2 })} />
          <path d={inkPath(MUMMY_HEAD, { seed: 183, amp: 1.6 })} />
        </clipPath>
      </defs>
      {/* torso */}
      <Blob pts={MUMMY_TORSO} fill={PARCH} seed={182} amp={2} />
      {/* head */}
      <Blob pts={MUMMY_HEAD} fill={PARCH} seed={183} amp={1.6} />
      {/* wrapping bands, clipped */}
      <g clipPath="url(#mummy-body-clip)">
        {[[44, 24, 90, 17], [42, 56, 98, 46], [30, 90, 112, 80], [26, 118, 114, 130], [28, 150, 114, 144], [32, 176, 110, 168]].map(([x1, y1, x2, y2], i) => (
          <Line key={i} pts={[[x1 as number, y1 as number], [x2 as number, y2 as number]]} stroke={INK} sw={2} seed={184 + i} />
        ))}
        <Line pts={[[50, 66], [88, 96], [108, 128]]} stroke={INK} sw={2} seed={190} />
        <Line pts={[[92, 66], [56, 98], [34, 130]]} stroke={INK} sw={2} seed={191} />
        {/* eye gap */}
        <Blob pts={[[46, 33], [92, 30], [93, 46], [45, 48]]} fill={INK} seed={192} amp={0.6} sw={1} />
      </g>
      <circle cx={61} cy={39} r={5} fill={GOLD} />
      <circle cx={80} cy={37} r={4} fill={GOLD} />
      {/* trailing bandage, drawn after the torso and kept inside the viewBox */}
      <Line pts={MUMMY_TRAIL} stroke={INK} sw={8} seed={181} amp={0.5} />
      <Line pts={MUMMY_TRAIL} stroke={PAPER} sw={4.5} seed={181} amp={0.5} />
      {/* arm holding a tag */}
      <Limb pts={[[34, 100], [12, 112], [8, 134]]} color={PARCH} sw={11} seed={193} />
      <Blob pts={[[0, 132], [18, 128], [20, 152], [2, 156]]} fill={SAGE} seed={194} amp={0.8} sw={2.5} />
      <circle cx={10} cy={136} r={1.6} fill={PAPER} />
    </>
  );
}

function TwoFacedJack() {
  return (
    <>
      {/* pole and crossbar */}
      <Line pts={[[75, 92], [76, 150], [75, 208]]} stroke={WALNUT} sw={7} seed={201} amp={0.8} />
      <Line pts={[[10, 112], [75, 108], [140, 104]]} stroke={WALNUT} sw={7} seed={202} amp={0.8} />
      {/* straw at the ends */}
      <Blob pts={[[8, 104], [0, 96, 1], [10, 108], [-2, 110, 1], [10, 114], [2, 124, 1], [16, 116]]} fill={GOLD} seed={203} amp={0.4} sw={2} />
      <Blob pts={[[142, 98], [150, 90, 1], [140, 102], [152, 104, 1], [140, 108], [148, 118, 1], [134, 110]]} fill={GOLD} seed={204} amp={0.4} sw={2} />
      <Blob pts={[[60, 204], [48, 210, 1], [66, 200], [74, 212, 1], [84, 200], [100, 210, 1], [92, 196]]} fill={GOLD} seed={205} amp={0.4} sw={2} />
      {/* shirt with a patch */}
      <Blob pts={[[48, 96], [76, 90], [104, 94], [110, 152], [76, 158], [40, 152]]} fill={BRICK} seed={206} amp={1.6} />
      <Blob pts={[[58, 120], [74, 118], [76, 134], [60, 136]]} fill={SAGE} seed={207} amp={0.6} sw={2} />
      <Line pts={[[56, 117], [78, 115]]} stroke={PAPER} sw={1.2} seed={208} amp={0.2} />
      {/* sack head, split down the middle */}
      <Blob pts={[[76, 30], [108, 40], [114, 70], [100, 94], [76, 98], [52, 94], [38, 70], [44, 40]]} fill={PARCH} seed={209} amp={1.8} />
      <Line pts={[[76, 34], [80, 50], [72, 64], [80, 78], [76, 96]]} stroke={INK} sw={2.5} seed={210} amp={0.6} />
      {[[74, 42, 80, 44], [70, 58, 78, 60], [74, 72, 82, 74]].map(([x1, y1, x2, y2], i) => (
        <Line key={i} pts={[[x1 as number, y1 as number], [x2 as number, y2 as number]]} stroke={INK} sw={1.5} seed={211 + i} amp={0.2} />
      ))}
      {/* affected face (left): X eye, flat frown */}
      <Line pts={[[50, 56], [66, 70]]} stroke={BRICK} sw={4} seed={215} amp={0.3} />
      <Line pts={[[66, 55], [50, 71]]} stroke={BRICK} sw={4} seed={216} amp={0.3} />
      <Line pts={[[50, 86], [60, 80], [70, 86]]} stroke={INK} sw={2.5} seed={217} amp={0.4} />
      {/* fixed face (right): round eye, smile */}
      <circle cx={92} cy={62} r={7} fill={PAPER} stroke={INK} strokeWidth={2.5} />
      <circle cx={93} cy={62} r={3.2} fill={SAGE} />
      <Line pts={[[84, 80], [94, 88], [104, 79]]} stroke={INK} sw={2.5} seed={218} amp={0.4} />
      {/* crooked hat */}
      <Blob pts={[[24, 38], [76, 28], [124, 34], [120, 44], [74, 38], [28, 48]]} fill={WALNUT} seed={219} amp={0.8} />
      <Blob pts={[[46, 34], [56, 4], [84, 0, 1], [100, 12], [104, 32], [76, 28]]} fill={WALNUT} seed={220} amp={1.2} />
      <Line pts={[[47, 28], [76, 24], [103, 27]]} stroke={GOLD} sw={4} seed={221} amp={0.4} />
    </>
  );
}

function SkeletonScribe() {
  const finger = (pts: readonly InkPoint[], seed: number) => (
    <>
      <Line pts={pts} stroke={INK} sw={13} seed={seed} amp={0.8} />
      <Line pts={pts} stroke={PARCH} sw={8} seed={seed} amp={0.8} />
    </>
  );
  return (
    <>
      {/* cuff and palm */}
      <Blob pts={[[52, 128], [108, 126], [116, 138], [46, 140]]} fill={BRICK} seed={231} amp={0.8} />
      <Blob pts={[[56, 128], [106, 126], [112, 92], [98, 78], [60, 78], [48, 92]]} fill={PARCH} seed={232} amp={1.4} />
      {finger([[62, 82], [56, 56], [48, 32]], 233)}
      {finger([[76, 80], [76, 46], [74, 16]], 234)}
      {finger([[90, 80], [95, 48], [100, 22]], 235)}
      {finger([[102, 86], [112, 62], [122, 44]], 236)}
      {[[56, 56], [76, 46], [95, 48], [112, 62], [60, 104], [84, 106]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i < 4 ? 5.5 : 4} fill={PARCH} stroke={INK} strokeWidth={2} />
      ))}
      <Line pts={[[66, 118], [88, 118]]} stroke={INK} sw={1.5} seed={237} amp={0.3} />
      {/* thumb pinching a quill */}
      {finger([[52, 108], [36, 96], [30, 76]], 238)}
      <Line pts={[[22, 118], [34, 66], [38, 32]]} stroke={INK} sw={7} seed={239} amp={0.4} />
      <Line pts={[[22, 118], [34, 66], [38, 32]]} stroke={GOLD} sw={3} seed={239} amp={0.4} />
      <Blob pts={[[38, 36], [20, 26], [10, 4, 1], [34, 14], [46, 6, 1], [46, 28]]} fill={PAPER} seed={240} amp={0.8} />
      <Line pts={[[4, 130], [18, 124], [34, 130]]} stroke={INK} sw={2.5} seed={241} amp={0.6} />
    </>
  );
}

/** Short cross-stitches along a seam: one tiny ink tick across the line at each point. */
function Stitches({ pts, seed }: { pts: readonly (readonly [number, number])[]; seed: number }) {
  return (
    <>
      {pts.map(([x, y], i) => (
        <Line key={i} pts={[[x - 2.6, y - 2.2], [x + 2.6, y + 2.2]]} stroke={INK} sw={1.6} seed={seed + i} amp={0.2} />
      ))}
    </>
  );
}

/**
 * Doctor Stitch (decision D15): a patchwork ghoul in a stained surgeon's coat, needle arm raised on the right with
 * a thread trailing from the needle, a spool of thread held low in the left hand. Seams are dashed with stitches.
 */
function DoctorStitch() {
  return (
    <>
      {/* the needle arm, raised from the coat's shoulder, and the curved needle with its thread */}
      <Limb pts={[[112, 92], [130, 70], [138, 42]]} color={PARCH} sw={11} seed={251} />
      <Blob pts={[[132, 46], [142, 40], [147, 30], [138, 28], [130, 36]]} fill={SAGE} seed={252} amp={0.8} />
      <Line pts={[[141, 31], [146, 18], [140, 6]]} stroke={INK} sw={4.2} seed={253} amp={0.3} />
      <Line pts={[[141, 31], [146, 18], [140, 6]]} stroke={MIST} sw={2} seed={253} amp={0.3} />
      <Line pts={[[140, 7], [126, 14], [118, 30], [122, 52]]} stroke={BRICK} sw={1.8} seed={254} amp={0.8} />
      {/* stained surgeon's coat: a crooked trapezoid with a ragged hem */}
      <Blob
        pts={[[56, 84], [104, 82], [118, 104], [126, 170], [110, 184, 1], [96, 174], [80, 186, 1], [64, 174], [48, 184, 1], [36, 170], [42, 104]]}
        fill={PARCH}
        seed={255}
        amp={1.6}
      />
      {/* patches sewn onto the coat */}
      <Blob pts={[[52, 118], [72, 116], [74, 138], [50, 140]]} fill={SAGE} seed={256} amp={1} sw={2.4} />
      <Blob pts={[[88, 146], [110, 142], [112, 162], [90, 166]]} fill={BRICK} seed={257} amp={1} sw={2.4} />
      <Blob pts={[[94, 98], [108, 100], [104, 112], [92, 110]]} fill={MOON} seed={258} amp={0.6} sw={2} />
      {/* seams: one down the coat front, one round each patch edge */}
      <Line pts={[[80, 88], [78, 130], [81, 178]]} stroke={WALNUT} sw={2} seed={259} />
      <Stitches pts={[[80, 98], [79, 112], [78, 126], [79, 140], [80, 154], [81, 168]]} seed={260} />
      <Stitches pts={[[52, 126], [62, 116], [73, 127], [61, 139]]} seed={270} />
      <Stitches pts={[[89, 155], [100, 143], [111, 152], [100, 165]]} seed={280} />
      {/* the spool hand, held low on the left: arm, a walnut spool wound with brick thread */}
      <Limb pts={[[48, 98], [32, 122], [28, 146]]} color={PARCH} sw={10} seed={290} />
      <Blob pts={[[16, 146], [40, 145], [41, 151], [15, 152]]} fill={WALNUT} seed={291} amp={0.4} sw={2.2} />
      <Blob pts={[[19, 152], [37, 151], [37, 166], [19, 167]]} fill={BRICK} seed={292} amp={0.5} sw={2.2} />
      <Blob pts={[[15, 167], [41, 166], [40, 173], [16, 173]]} fill={WALNUT} seed={293} amp={0.4} sw={2.2} />
      <Line pts={[[22, 156], [34, 158]]} stroke={INK} sw={1.2} seed={294} amp={0.2} />
      <Line pts={[[22, 162], [34, 163]]} stroke={INK} sw={1.2} seed={295} amp={0.2} />
      {/* patchwork head: two halves of different skin joined by a stitched seam, a crooked surgeon's cap */}
      <Blob pts={[[60, 34], [82, 28], [82, 86], [62, 82], [54, 60]]} fill={SAGE} seed={296} amp={1.2} />
      <Blob pts={[[82, 28], [100, 34], [106, 60], [98, 82], [82, 86]]} fill={MIST} seed={297} amp={1.2} />
      <Line pts={[[82, 30], [83, 58], [82, 84]]} stroke={INK} sw={1.8} seed={298} amp={0.6} />
      <Stitches pts={[[82, 40], [83, 52], [83, 64], [82, 76]]} seed={300} />
      <Blob pts={[[54, 38], [66, 16, 1], [96, 12], [108, 30], [82, 26]]} fill={MOON} seed={305} amp={1.2} />
      <Eye cx={70} cy={54} r={6} look={[1.5, -1]} ball={PAPER} />
      <Eye cx={95} cy={52} r={4.4} look={[1, -1]} ball={GOLD} />
      <Line pts={[[66, 72], [76, 70], [84, 74], [94, 70]]} stroke={INK} sw={2.2} seed={306} amp={0.6} />
    </>
  );
}

const SHAPES: Readonly<Record<MascotId, () => ReactNode>> = {
  "doctor-stitch": DoctorStitch,
  "mini-bat": MiniBat,
  "mini-ghost": MiniGhost,
  "wraith-director": WraithDirector,
  "watchtower-warden": WatchtowerWarden,
  "bat-scout": BatScout,
  "pumpkin-mechanic": PumpkinMechanic,
  "raven-archivist": RavenArchivist,
  "gargoyle-gatekeeper": GargoyleGatekeeper,
  "cauldron-cat": CauldronCat,
  "spider-weaver": SpiderWeaver,
  "mummy-wrapper": MummyWrapper,
  "two-faced-jack": TwoFacedJack,
  "skeleton-scribe": SkeletonScribe,
};

export interface PlaceholderMascotProps {
  readonly id: MascotId;
  /** CSS px. Defaults to the mascot's roster size. Height follows the viewBox aspect unless given. */
  readonly width?: number;
  readonly height?: number;
  /**
   * Decorative figures are hidden from assistive technology (the name is already in nearby text).
   * Informative figures get `role="img"` and the mascot name as the accessible name.
   */
  readonly decorative?: boolean;
  /** Overrides the accessible name (default: the mascot's real name). */
  readonly label?: string;
  readonly className?: string;
}

export function PlaceholderMascot({ id, width, height, decorative = false, label, className }: PlaceholderMascotProps) {
  const { size } = MASCOT_ART[id];
  const w = width ?? (height !== undefined ? Math.round((height * size.w) / size.h) : size.w);
  const h = height ?? Math.round((w * size.h) / size.w);
  const Shape = SHAPES[id];
  const name = label ?? CREW_BY_ID[id].name;
  const a11y = decorative ? ({ "aria-hidden": true } as const) : ({ role: "img", "aria-label": name } as const);
  const reg = misregistration(id);
  return (
    <svg
      className={className ? `art-placeholder ${className}` : "art-placeholder"}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size.w} ${size.h}`}
      width={w}
      height={h}
      focusable="false"
      data-art="placeholder"
      data-mascot={id}
      {...a11y}
    >
      <InkWeight.Provider value={reg.weight}>
        {/* Colour plate, shifted. components.css drops its ink lines and ink fills, so only colour shows. */}
        <g className="art-plate art-plate--fill" transform={`translate(${reg.dx} ${reg.dy})`} data-plate="fill">
          <Shape />
        </g>
        {/* Ink plate, in register with the viewBox. */}
        <g className="art-plate art-plate--ink" data-plate="ink">
          <Shape />
        </g>
      </InkWeight.Provider>
    </svg>
  );
}
