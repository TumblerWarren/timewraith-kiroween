import { Clock } from "../components/Clock";
import { EvidenceLadder } from "../components/EvidenceLadder";
import { ABOUT, FIG } from "../content/app";
import { PROBLEM_ILLUSTRATION_LABEL } from "../content/copy";
import { CREW, CREW_BY_ID } from "../content/crew";
import { FLOW_STEPS } from "../content/flow";
import { Mascot } from "../mascots/Mascot";

/** The four Kiro agents (backend/agents/*.md); every other mascot stands for plain code. */
const KIRO_AGENTS: ReadonlySet<string> = new Set(FLOW_STEPS.filter((s) => s.kind === "kiro-agent").map((s) => s.lead));

/** `#/about`: the failure class, the six steps, the Crew and the evidence ladder. */
export function AboutPage() {
  const crew = CREW.filter((m) => m.kind !== "companion");
  return (
    <article className="page" aria-labelledby="page-title">
      <header className="page__head">
        <h1 id="page-title" className="page__title" tabIndex={-1}>
          {ABOUT.title}
        </h1>
        <p className="page__lead">{ABOUT.lead}</p>
      </header>

      <section className="panel lost-hour" aria-labelledby="lost-title">
        <div className="lost-hour__clocks" aria-hidden="true">
          <figure>
            <Clock id="about-before" hours={1} minutes={59} />
            <figcaption className="mono">01:59</figcaption>
          </figure>
          <span className="lost-hour__jump">→</span>
          <figure>
            <Clock id="about-after" hours={3} minutes={0} />
            <figcaption className="mono">03:00</figcaption>
          </figure>
        </div>
        <div>
          <h2 id="lost-title" className="panel__title">
            {ABOUT.lostHourTitle}
          </h2>
          <p>{ABOUT.lostHourText}</p>
          <p className="row__meta">{PROBLEM_ILLUSTRATION_LABEL}</p>
        </div>
      </section>

      <section className="section-block" aria-labelledby="flow-title">
        <h2 id="flow-title">{ABOUT.flowTitle}</h2>
        <ol role="list" className="about-flow">
          {FLOW_STEPS.map((s) => (
            <li key={s.id} className="about-flow__step" data-kind={s.kind}>
              <span aria-hidden="true">
                <Mascot id={s.lead} width={FIG.badge} decorative idle={false} actor={false} />
              </span>
              <div>
                <h3>
                  <span className="about-flow__no">{s.followOn ? "+" : s.index}</span> {s.title}
                </h3>
                <p className="row__meta">
                  {s.kind === "kiro-agent" ? "Kiro agent" : "Code"} · {s.mascots.map((id) => CREW_BY_ID[id].name).join(", ")}
                </p>
                <p>{s.summary}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="section-block" aria-labelledby="crew-title">
        <h2 id="crew-title">{ABOUT.crewTitle}</h2>
        <p className="page__lead">{ABOUT.crewLead}</p>
        <ul role="list" className="crew-grid">
          {crew.map((m) => (
            <li key={m.id} className="crew-card" data-kind={m.kind}>
              <span aria-hidden="true">
                <Mascot id={m.id} width={FIG.badge} decorative idle={false} actor={false} />
              </span>
              <h3 className="crew-card__name">{m.name}</h3>
              <p className="crew-card__kind">{KIRO_AGENTS.has(m.id) ? "Kiro agent" : "Code"}</p>
              <p>{m.job}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-block section-block--paper" aria-labelledby="ladder-title">
        <h2 id="ladder-title">{ABOUT.ladderTitle}</h2>
        <EvidenceLadder />
      </section>
    </article>
  );
}
