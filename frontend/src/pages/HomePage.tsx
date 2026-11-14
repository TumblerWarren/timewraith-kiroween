import { Button } from "@astryxdesign/core/Button";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { TextInput } from "@astryxdesign/core/TextInput";
import { defineTheme, Theme } from "@astryxdesign/core/theme";
import { useRef, useState, type FormEvent } from "react";
import { useReduceMotion } from "../a11y/ReduceMotionProvider";
import { href, navigate } from "../app/router";
import { validateField } from "../cases/form/validate";
import { LanternWraith } from "../components/cinematic/LanternWraith";
import { LANDING_STAGES, TIME_BUGS } from "../content/landing";
import "@astryxdesign/core/astryx.css";

const landingTheme = defineTheme({
  name: "timewraith-midnight",
  tokens: {
    "--font-family-body": "var(--font-ui)",
    "--font-family-heading": "var(--font-display)",
    "--font-family-code": "var(--font-mono)",
  },
});

function Arrow({ diagonal = false }: { readonly diagonal?: boolean }) {
  return <svg className="midnight-arrow" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <path d={diagonal ? "M4 12 12 4M6 4h6v6" : "M2 8h11m-4-4 4 4-4 4"} />
  </svg>;
}

function Workflow() {
  const [active, setActive] = useState(0);
  const stage = LANDING_STAGES[active] ?? LANDING_STAGES[0];
  const next = (active + 1) % LANDING_STAGES.length;
  return <section className="midnight-workflow" id="investigation" aria-labelledby="workflow-title">
    <div className="midnight-section-head">
      <div data-lantern-reveal>
        <p className="midnight-kicker">How TimeWraith works</p>
        <h2 id="workflow-title">From suspicion <br />to <em>proof.</em></h2>
      </div>
      <p data-lantern-reveal>Five stages. Follow the source location, reproducible test, and verification result behind a finding.</p>
    </div>
    <TabList className="midnight-tabs" role="tablist" aria-label="Investigation stages" value={String(active)}
      onChange={value => setActive(Number(value))} layout="fill" size="lg" overflow="visible">
      {LANDING_STAGES.map((item, index) => (
        <Tab key={item.label} className="midnight-tab" data-lantern-reveal id={`workflow-tab-${index}`}
          panelId={`workflow-panel-${index}`} value={String(index)} label={item.label}
          icon={<span className="midnight-tab-number" aria-hidden="true">0{index + 1}</span>} />
      ))}
    </TabList>
    {LANDING_STAGES.map((item, index) => <div key={item.label}
      id={`workflow-panel-${index}`} role="tabpanel" aria-labelledby={`workflow-tab-${index}`}
      hidden={index !== active} className="midnight-stage">
      <div className="midnight-stage-story" data-lantern-reveal>
        <p className="midnight-stage-kicker">{item.kicker}</p>
        <h3>{item.title}</h3>
        <p>{item.copy}</p>
        <Button variant="ghost" className="midnight-quiet" label={index === 4 ? "Back to Clone" : `Next: ${LANDING_STAGES[next]?.label}`}
          endContent={<Arrow />} onClick={() => {
            setActive(next);
            document.getElementById(`workflow-tab-${next}`)?.focus({ preventScroll: true });
          }} />
      </div>
      <div className="midnight-evidence" data-lantern-reveal>
        <div className="midnight-evidence-head"><span>{item.file}</span><span>Illustrative example</span></div>
        <pre>{item.code}</pre>
        <p>{item.note}</p>
      </div>
    </div>)}
    <span className="visually-hidden" aria-live="polite">{stage.label}</span>
  </section>;
}

export function HomePage() {
  const { reduceMotion, toggle } = useReduceMotion();
  const [paused, setPaused] = useState(false);
  const [repo, setRepo] = useState("");
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const page = useRef<HTMLElement>(null);
  const artwork = useRef<HTMLDivElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = repo.trim();
    const repoUrl = /^github\.com\//i.test(typed) ? `https://${typed}` : typed;
    const message = validateField("repoUrl", { repoUrl });
    setError(message);
    if (message) input.current?.focus();
    else navigate({ page: "new", repoUrl });
  }

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth" });
  }

  return <Theme theme={landingTheme} mode="dark">
    <article ref={page} className="midnight-home" data-lantern-motion={reduceMotion ? "off" : "on"} aria-labelledby="page-title">
      <LanternWraith page={page} anchor={artwork} paused={paused} reduced={reduceMotion} />
      <div className="midnight-wrap">
        <header className="midnight-nav">
          <a className="midnight-brand" href={href({ page: "home" })} aria-current="page">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" /><path d="M12 6.5V12l3 2M12 1v2.5M12 20.5V23" />
            </svg>
            <span>TIME<em>WRAITH</em></span>
          </a>
          <nav aria-label="Main navigation">
            <a href={href({ page: "home" })} aria-current="page">Home</a>
            <button type="button" onClick={() => jump("investigation")}>How it works</button>
            <a href={href({ page: "about" })}>The crew</a>
            <a href={href({ page: "cases" })}>Cases <Arrow diagonal /></a>
            <a href={href({ page: "crew" })}>Crew setup <Arrow diagonal /></a>
            <button type="button" onClick={() => jump("time-bugs")}>Features</button>
            <a href={href({ page: "about" })}>Docs</a>
          </nav>
          <a className="midnight-new" href={href({ page: "new" })}>New case <Arrow diagonal /></a>
        </header>

        <section className="midnight-hero">
          <div className="midnight-hero-copy">
            <p className="midnight-kicker"><span />Agentic time-bug investigation</p>
            <h1 id="page-title" tabIndex={-1}>Hunt the bugs <br />that hide in <br /><em>time.</em></h1>
            <p className="midnight-lead" data-lantern-reveal>Midnight is only the beginning. A crew of specialized Kiro agents finds, reproduces, and helps fix time-critical bugs in your repository.</p>
            <form className="midnight-form" data-lantern-reveal onSubmit={submit} noValidate>
              <TextInput ref={input} label="Repository URL" id="landing-repository" htmlName="repository"
                type="url" autoComplete="url" placeholder="github.com/owner/repo" value={repo}
                onChange={value => { setRepo(value); setError(undefined); }} hasSpellCheck={false}
                containerClassName="midnight-field" controlClassName="midnight-field-control"
                startIcon={<Arrow diagonal />}
                {...(error ? { status: { type: "error", message: error } as const } : {})} />
              <Button type="submit" label="Start investigation" variant="primary" className="midnight-submit"
                endContent={<>
                  <Arrow />
                  <svg className="midnight-trace" viewBox="0 0 180 44" preserveAspectRatio="none" aria-hidden="true">
                    <rect x="1" y="1" width="178" height="42" rx="3" pathLength="1" />
                  </svg>
                </>} />
            </form>
            <p className="midnight-meta" data-lantern-reveal>Powered by Kiro <span>/</span> Evidence before fixes.</p>
          </div>
          <div ref={artwork} className="midnight-visual" aria-hidden="true" />
        </section>

        <Workflow />

        <section className="midnight-features" id="time-bugs" aria-labelledby="bugs-title">
          <div data-lantern-reveal>
            <p className="midnight-kicker">The bugs we hunt</p>
            <h2 id="bugs-title">Time is never <br /><em>that simple.</em></h2>
          </div>
          <ol role="list">
            {TIME_BUGS.map((item, index) => <li key={item.title} data-lantern-reveal>
              <span aria-hidden="true">0{index + 1}</span>
              <div><h3>{item.title}</h3><p>{item.copy}</p></div>
            </li>)}
          </ol>
        </section>

        <footer className="midnight-footer">
          <span data-lantern-reveal>TimeWraith / An investigation tool</span>
          <div>
            <Button variant="ghost" className="midnight-quiet" data-lantern-reveal aria-pressed={paused} isDisabled={reduceMotion}
              label={paused ? "Resume ghost" : "Pause ghost"} onClick={() => setPaused(!paused)} />
            <Button variant="ghost" className="midnight-quiet" data-lantern-reveal aria-pressed={reduceMotion}
              label="Reduce motion" onClick={toggle} />
            <a className="landing-replay" data-lantern-reveal href={href({ page: "landing" })}>Replay the midnight intro</a>
          </div>
        </footer>
      </div>
    </article>
  </Theme>;
}
