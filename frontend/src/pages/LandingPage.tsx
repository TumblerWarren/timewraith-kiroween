import { Intro } from "../animation/react/MidnightIntro";
import { href } from "../app/router";

export function LandingPage() {
  return (
    <section className="clock-landing" aria-labelledby="page-title">
      <h1 id="page-title" className="visually-hidden" tabIndex={-1}>
        TimeWraith · The midnight hour
      </h1>
      <a className="clock-landing__fallback" href={href({ page: "home" })}>
        Enter TimeWraith
      </a>
      <Intro />
    </section>
  );
}
