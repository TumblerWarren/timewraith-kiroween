import { useEffect, useState, type CSSProperties } from "react";
import { useDirectorHost } from "../../animation/react/directorHost";
import { FLOW_ACT_POSE } from "../../animation/react/regionCast";
import { viewportRect } from "../../animation/react/useBatFlights";
import { useLeadLineStep } from "../../animation/react/useLeadLine";
import { paperTilt, stampTilt } from "../../components/tilt";
import { CREW_BY_ID, type MascotId } from "../../content/crew";
import { FLOW_STEPS, type FlowStep } from "../../content/flow";
import { FLOW_ACTIVE_LABEL, FLOW_GATE_TAG, FLOW_HEADING, FLOW_INTRO } from "../../content/sections";
import { inkPath } from "../../mascots/placeholder/inkPath";
import { Mascot } from "../../mascots/Mascot";
import { heightForWidth } from "../../mascots/roster";

/**
 * Figure widths on the landings, in CSS px at 768px and up (below that, flow.css scales them by --fig-scale).
 * The Watchtower Warden at the approve gate is the one big figure; the other leads are medium and the helpers
 * standing beside the signboards are small.
 */
const FIGURE_W: Readonly<Partial<Record<MascotId, number>>> = {
  "wraith-director": 128,
  "gargoyle-gatekeeper": 92,
  "bat-scout": 150,
  "two-faced-jack": 84,
  "watchtower-warden": 168,
  "pumpkin-mechanic": 124,
  "cauldron-cat": 92,
  "spider-weaver": 80,
  "mummy-wrapper": 80,
  "raven-archivist": 116,
  "skeleton-scribe": 96,
  "doctor-stitch": 120,
};
const DEFAULT_W = 96;
const widthOf = (id: MascotId) => FIGURE_W[id] ?? DEFAULT_W;

/**
 * A crooked gateway around the Warden on the approve landing: two posts and a lintel, hand-inked. It is the spot
 * where the Bat Burst plays once the director exists (`data-burst-anchor`). Decorative.
 */
const GATE = {
  posts: [
    inkPath(
      [
        [6, 200],
        [10, 30],
        [24, 28],
        [22, 200],
      ],
      { seed: 91, amp: 1.6 },
    ),
    inkPath(
      [
        [176, 200],
        [178, 32],
        [192, 30],
        [190, 200],
      ],
      { seed: 92, amp: 1.6 },
    ),
  ],
  lintel: inkPath(
    [
      [0, 30, 1],
      [98, 4],
      [200, 28, 1],
      [196, 42, 1],
      [98, 20],
      [4, 44, 1],
    ],
    { seed: 93, amp: 1.4 },
  ),
};

function GateArt() {
  return (
    <svg
      className="flow__gate"
      viewBox="0 0 200 200"
      width={200}
      height={200}
      preserveAspectRatio="none"
      focusable="false"
      aria-hidden="true"
      data-burst-anchor="approve"
    >
      {GATE.posts.map((d, i) => (
        <path key={i} d={d} fill="var(--paper-100)" stroke="var(--ink-900)" strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
      {/* Walnut lintel with a gold edge: on the tower-950 stairwell an ink lintel would disappear (visual revision R2). */}
      <path d={GATE.lintel} fill="var(--walnut-700)" stroke="var(--gold-500)" strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StepMascot({ id, lead }: { readonly id: MascotId; readonly lead: boolean }) {
  const w = widthOf(id);
  return (
    <li
      className="flow__mascot"
      data-mascot-id={id}
      data-lead={lead ? "true" : undefined}
      style={{ "--fig-w": `${w}px`, "--fig-h": `${heightForWidth(id, w)}px` } as CSSProperties}
    >
      {/* The name is printed on the tag beside the figure, so the art itself is decorative. */}
      <Mascot id={id} width={w} decorative />
      <p className="flow__mascot-name paper-piece" style={paperTilt(`flow-name-${id}`, 1.4, 2)}>
        {CREW_BY_ID[id].name}
      </p>
    </li>
  );
}

/**
 * One landing of the tower stairs. The step's number and title are hand-lettered on a signboard that stands on the
 * landing; the step's lead mascot perches on top of the sign and the helpers stand beside it, overlapping its edge.
 */
/** The active-landing marker: a small lit lantern (shape) and the text, so the state is not carried by color. */
function ActiveMarker({ stepId }: { readonly stepId: string }) {
  return (
    <p className="flow__active stamp" data-flow-active="" style={stampTilt(`flow-active-${stepId}`, 3)}>
      <svg className="flow__active-lamp" viewBox="0 0 20 24" width={16} height={20} focusable="false" aria-hidden="true">
        <path d="M6 4 L14 4 L16 9 L14 20 L6 20 L4 9 Z" fill="var(--gold-500)" stroke="var(--ink-900)" strokeWidth={2} strokeLinejoin="round" />
        <path d="M8 1 L12 1 L12 4 L8 4 Z" fill="var(--ink-900)" />
      </svg>
      {FLOW_ACTIVE_LABEL}
    </p>
  );
}

function Step({ step, active }: { readonly step: FlowStep; readonly active: boolean }) {
  const titleId = `flow-step-${step.id}-title`;
  const leadW = widthOf(step.lead);
  return (
    <li
      className="flow__step"
      data-step={step.id}
      data-side={step.index % 2 === 1 ? "start" : "end"}
      data-burst={step.burst ? "true" : undefined}
      data-active={active ? "true" : undefined}
      aria-current={active ? "step" : undefined}
      style={{ "--lead-h": `${heightForWidth(step.lead, leadW)}px` } as CSSProperties}
    >
      <div className="flow__landing" style={paperTilt(`flow-landing-${step.id}`, 0.5, 0)}>
        {step.burst ? <GateArt /> : null}
        <div className="flow__sign" style={paperTilt(`flow-sign-${step.id}`, 1.4, 2)}>
          {/* The numeral is set in the display face: it is an ordinal, not a time or an evidence value. The list
              itself is an <ol>, so the number is not repeated to assistive technology. */}
          <span className="flow__sign-no" aria-hidden="true">
            {step.index}
          </span>
          <h3 id={titleId} className="flow__title">
            {step.title}
          </h3>
        </div>
        {step.burst ? (
          <p className="flow__gate-tag stamp" style={stampTilt(`flow-gate-${step.id}`)}>
            {FLOW_GATE_TAG}
          </p>
        ) : null}
        <ul className="flow__mascots" role="list" aria-label={`Crew on the ${step.title.toLowerCase()} landing`}>
          {step.mascots.map((id) => (
            <StepMascot key={id} id={id} lead={id === step.lead} />
          ))}
        </ul>
      </div>
      <p className="flow__text">{step.summary}</p>
      {active ? <ActiveMarker stepId={step.id} /> : null}
    </li>
  );
}

/**
 * Flow (the dark stairwell, tower-950; paper-100 text): the Investigation_Flow as six landings down the tower stairs (scope, plan,
 * approve, run, evidence, fix; decision D17), switching sides as the stair turns. Each landing has a signboard with the step's number
 * and title, with the step's lead mascot perched on it. Every Crew_Agent and System_Component_Mascot appears exactly
 * once (Requirements 3.6, 3.8). The approve landing stands in a gateway where the Bat Burst plays (Requirement 3.7).
 * The landing at the lead line is the active step (task 14.7): it carries `aria-current="step"` and the "The Crew is
 * here now" marker (text and shape), and the first time each landing becomes active it requests `flow.step` (its
 * mascots act); the approve landing also requests the Bat Burst from its gateway.
 */
export function Flow() {
  const [list, setList] = useState<HTMLOListElement | null>(null);
  const active = useLeadLineStep(list);
  const host = useDirectorHost();

  useEffect(() => {
    if (!host || !active || !list || !host.claimOnce(`flow:${active}`)) return;
    const step = FLOW_STEPS.find((s) => s.id === active);
    const item = list.querySelector(`li[data-step="${active}"]`);
    if (!step || !item) return;
    const targets = [item.querySelector(".flow__sign"), item.querySelector("[data-flow-active]")].filter((e): e is Element => e !== null);
    host.request("flow.step", { step: step.id, targets, actors: step.mascots.map((id) => ({ actor: `flow:${id}`, pose: FLOW_ACT_POSE })) });
    const anchor = step.burst ? item.querySelector('[data-burst-anchor="approve"]') : null;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      host.request("bats.burst", { origin: { x: r.left, y: r.top, w: r.width, h: r.height * 0.5 }, bounds: viewportRect(), seed: (Date.now() & 0x7fffffff) >>> 0 });
    }
  }, [host, active, list]);

  return (
    <section id="flow" className="section section--flow" aria-labelledby="flow-title">
      <div className="section__inner">
        <div className="rail" aria-hidden="true" data-thread-anchor="" />
        <div className="content">
          <div className="flow__intro">
            <h2 id="flow-title" tabIndex={-1}>
              {FLOW_HEADING}
            </h2>
            <p>{FLOW_INTRO}</p>
          </div>

          <ol ref={setList} className="flow__steps" role="list">
            {FLOW_STEPS.map((step) => (
              <Step key={step.id} step={step} active={step.id === active} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
