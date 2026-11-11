---
name: write-kiro-usage-readme
description: Write the Kiro-usage section of the TimeWraith README and the Devpost notes for the Kiroween 2026 submission. Collect specs, steering, hooks, skills and dated evidence from docs/kiro-usage.md, and record the three hackathon categories (Costume Contest as the lead, Frankenstein and Resurrection as supporting angles). Use for README, Kiro usage write-up, Devpost, hackathon categories or submission text.
metadata:
  project: timewraith
---
# Write the Kiro-usage README section

1. Read `docs/kiro-usage.md`. Every claim in the write-up must cite an entry there or a real file; drop anything that has no evidence.
2. List what exists, by looking at the files, not from memory:
   - Specs: `.kiro/specs/timewraith/{requirements,design,tasks}.md`
   - Steering: `.kiro/steering/*.md` (inclusion mode of each)
   - Hooks: `.kiro/hooks/*.json` and the helpers in `scripts/hooks/`
   - Skills: `.kiro/skills/*/SKILL.md`
3. For each of specs, steering, hooks and skills, write what it did in this project and one dated example from `docs/kiro-usage.md` (what it caught, with the file reference).
4. Add the hackathon categories (decision D10, Requirement 17.7), in this order:
   - **Costume Contest (lead):** the hand-inked, cel-painted UI and the mascot cast.
   - **Frankenstein (supporting):** a Crew of agents (planner, orchestrator, explorer, experimenter, verifier) stitched to Playwright clock control, a sandbox runner and a version comparator.
   - **Resurrection (supporting):** old date-boundary bugs from public issue trackers, such as FullCalendar #7998, revived as reproducible evidence.
5. Devpost may require one primary category. Re-read the 2026 rules first. If several categories are not allowed, keep Costume Contest as the single entered category and keep the other two as supporting angles in the text only. Record all three angles, Costume Contest first, in `docs/devpost-notes.md`.
6. Keep the README honest (Requirement 16): sample data is labeled sample, illustrative or simulated; FullCalendar #7998 is the source of the sample scenario and is never presented as a new finding; mascots that are placeholders are named as such.
7. Also include in the README the setup commands, the asset pipeline commands and the test commands (Requirement 17.5), and point to the LICENSE the user chose.
8. Add a line to `docs/kiro-usage.md` recording that the write-up was produced and which entries it cites.
