# Requirements Document

## Introduction

TimeWraith is a Halloween-themed Kiro Crew agent team for date-sensitive open-source apps: an autonomous regression investigator for date-sensitive apps. A user brings any target app (a public Git repository pinned to a version, tag or commit, or a local app URL). The Crew explores the app, picks the date-sensitive user journeys, runs controlled-clock experiments in an isolated environment, reproduces failures on a pinned version, and reports both known and new date and time bugs with reproducible evidence. For a verified failure it suggests a fix together with a regression test. TimeWraith does not claim to find arbitrary bugs on arbitrary websites; it investigates date, time-zone, DST and date-boundary behaviour of a target the user brings.

This specification covers one deliverable for the Kiroween 2026 hackathon: one production-level app screen, the TimeWraith home screen, called the Case_Board. The Case_Board replaced the marketing landing page of the first spec version (design decision D14). It is still a single route and still uses bundled mock data until the backend milestone. It must show that any app can be brought in: the user opens a case for a target, browses a library of cases, and inspects one case in detail.

The Case_Board is one continuous vertical scroll. A hand-inked timeline thread runs down the board, each Section is a dated node on the thread, and the mascots of each Section react as it enters view. The story still runs from clocktower night at the top to dawn at the bottom. Since visual revision R2 (design.md, decision D13) the board stays at night through most Sections and reaches dawn only in the Closing Section; cream is the colour of paper objects (case cards, the case-file sheet, the ladder scroll) on the way down. All data shown is mock data; every mock region is labelled sample, illustrative or simulated. The real backend and real investigation runs are a later milestone.

The visual direction is Vintage Halloween Cartoon × Illustrated Clocktower, hand-inked and cel-painted. The frontend is the scoring surface for the hackathon, so animation quality, palette, and layout carry the most weight. Animations are required in this version and must run in the browser, not only exist in code.

Out of scope: real investigation runs, a real backend or gateway, authentication, multiple routes, contacting the target or issue URLs a user enters, the other screens of the source design document (the full Overview, Test Plan, Live Lab, Findings and Report work areas, the Target Library, the Evidence Vault, Kiro Crew Studio and Settings), and sound. Also out of scope for v1: a general-purpose bug hunter for bugs that are not about dates and time (in the style of an AI code reviewer such as CodeRabbit), which is a possible later direction and is mentioned only as such; and backup sample cases such as Cal.com #24350, which is kept as a candidate in the design and is not shown on the Case_Board (decision D23).

## Glossary

- **Case_Board**: The single scrolling app screen (the TimeWraith home screen) that is the deliverable of this specification. It replaced the Landing_Page (decision D14).
- **Landing_Page**: The deliverable of the first spec version, a marketing landing page. Superseded by the Case_Board; where a criterion kept for history says Landing_Page, read Case_Board.
- **Frontend**: The Vite + React 19 + TypeScript application in the `frontend/` directory that renders the Case_Board.
- **App_Header**: The page header containing the TimeWraith wordmark, the clock-stamp navigation to the Sections, the Reduce_Motion_Toggle and the Gateway_Status_Badge.
- **Gateway_Status_Badge**: The badge in the App_Header that reads "Demo mode, simulated status" and never claims a live gateway connection.
- **Timeline_Thread**: The hand-inked vertical line, drawn as SVG, that runs down the Case_Board and connects the Section_Nodes.
- **Section_Node**: A dated marker on the Timeline_Thread that anchors one Section. The clock-stamp navigation in the App_Header links to the same Sections.
- **Section**: One of the seven Case_Board regions, in order: Open_Case_Panel, Lost_Hour, Case_Library, Case_View, Crew, Investigation_Flow, and Closing.
- **Open_Case_Panel**: Section 1, containing the headline, the subhead, the positioning line, the Clock, the Wraith Director, the Open_Case_Form and the Setup_Checklist. It replaced the Hero.
- **Hero**: Section 1 of the Landing_Page. Superseded by the Open_Case_Panel.
- **Open_Case_Form**: The form in the Open_Case_Panel with which a user brings a Target and chooses a Case_Mode.
- **Target**: The app under investigation: either a public Git repository URL plus a Target_Version, or a local app URL.
- **Target_Version**: A tag, branch or commit hash that pins a repository Target.
- **Case_Mode**: One of Known issue (a public issue URL is given and the Crew reproduces it), Blind hunt (an issue URL is given but hidden from the Crew until the Reveal_Step), or Open hunt (no issue; the Crew explores).
- **Blind_Benchmark**: The user's name for a Blind hunt Case: the issue text is hidden from the Crew, the Crew investigates, and at the Reveal_Step the original report is shown and compared with the Crew's finding. In this version the only Blind_Benchmark is the illustrative Cal.com Sample_Case; no real Blind_Benchmark run exists yet.
- **Case**: One investigation of one Target in one Case_Mode, shown as a Case_Card and in the Case_View.
- **Sample_Case**: One of the two Cases bundled with the Frontend, FullCalendar #7998 and Cal.com #30021, each built from a hand-authored Mock_Event_Stream and labelled as sample or illustrative data.
- **Draft_Case**: A Case created by submitting the Open_Case_Form. It is stored in localStorage only and is never run in this version.
- **Case_Card**: The card that represents one Case in the Case_Library.
- **Case_Library**: Section 3, the list of Case_Cards for the Sample_Cases and the Draft_Cases.
- **Case_View**: Section 4, the in-page detail of the selected Case: the Replay_Lab, the Evidence_Ladder for the Case, the time-control statement and the Suggested_Fix. It absorbed the Proof Section.
- **Lost_Hour**: Section 2, a short explainer region that shows a daylight-saving-time night in which an hour vanishes. It replaced the Problem Section and keeps its scene.
- **Problem**: Section 2 of the Landing_Page. Superseded by the Lost_Hour.
- **Crew**: Section 5, which shows the roster of Mascots with one line of job description each.
- **Investigation_Flow**: Section 6, which shows how a case runs in six steps: scope, plan, approve, run, evidence, fix.
- **Replay_Lab**: The part of the Case_View that contains the Recorded_Replay of the selected Case.
- **Proof**: Section 6 of the Landing_Page. Superseded; its Evidence_Ladder and "Browser time ≠ server time" content is now case-scoped inside the Case_View.
- **Closing**: Section 7, containing the closing "Open a case" prompt, the secondary links and the footer. It replaced the Final_CTA.
- **Final_CTA**: Section 7 of the Landing_Page. Superseded by the Closing.
- **Clock**: The large painted clock face in the Open_Case_Panel with separate SVG clock hands.
- **Mascot**: One of the 14 characters listed in Requirement 4.
- **Crew_Agent**: A Mascot that represents an agent: Wraith Director (planner), Watchtower Warden (orchestrator), Bat Scout (explorer), Pumpkin Mechanic (time experimenter), Raven Archivist (verification agent), or Doctor Stitch (patch-maker). In the three-agent pitch, the Explorer is Bat Scout, the Time Experimenter is Pumpkin Mechanic and the Verification agent is Raven Archivist; Doctor Stitch (fix), Wraith Director (planner) and Watchtower Warden (orchestrator) complete the Crew (decision D23).
- **Doctor_Stitch**: The 14th Mascot, a patchwork ghoul in a stained surgeon's coat with a needle in one hand and a spool of thread in the other, who reads the Raven Archivist's verified failure and stitches a Suggested_Fix and the regression test that proves it.
- **System_Component_Mascot**: A Mascot that represents a system component: Gargoyle Gatekeeper, Cauldron Cat, Spider Weaver, Mummy Wrapper, Two-Faced Jack, or Skeleton Scribe.
- **Companion**: Mini Bat or Mini Ghost.
- **Tier_1_Mascot**: A Mascot with a layered PNG-part rig and full animation: Wraith Director, Watchtower Warden, Bat Scout, Pumpkin Mechanic, Raven Archivist, Doctor Stitch, Mini Bat, and Mini Ghost.
- **Tier_2_Mascot**: A Mascot with a hero pose, an idle animation, and a hover or in-view reaction: Gargoyle Gatekeeper, Cauldron Cat, Spider Weaver, Mummy Wrapper, Two-Faced Jack, and Skeleton Scribe.
- **Bat_Burst**: A short animation in which several Mini Bat sprites scatter from an anchor point.
- **MotionDirector**: The single central module that queues, prioritizes, and caps all narrative animation effects.
- **Priority_Level**: One of P0 (user-critical), P1 (state-critical), P2 (direct interaction), or P3 (ambient), as defined in the design document section 9.
- **Overlay_Layer**: The single full-viewport layer with pointer events disabled in which roaming Mascots are rendered.
- **Reduce_Motion_Mode**: The state in which decorative animation is replaced by a static state marker or a very short fade. The state is set by the Reduce_Motion_Toggle or by the `prefers-reduced-motion` media query.
- **Reduce_Motion_Toggle**: The control in the App_Header that switches Reduce_Motion_Mode on and off.
- **Setup_Checklist**: The checklist in the Open_Case_Panel that lists simulated setup checks.
- **Recorded_Replay**: The scrubbable timeline in the Replay_Lab, built from the selected Sample_Case's Mock_Event_Stream.
- **Recorded_Investigation_Replay**: A replay recorded from a real Kiro Crew run against a real Target. None exists in this version; both Sample_Case replays are hand-authored.
- **Event_Track**: The track of the Recorded_Replay that shows what the Crew did, one entry per event.
- **Version_Clock_Track**: The track of the Recorded_Replay that shows, for each event, which Target_Version it ran against and which controlled clock value or time-zone setting it used.
- **Mock_Event_Stream**: A hand-authored list of timestamped events that drives the Recorded_Replay of one Sample_Case, with a Target_Version and a clock reading on every event. The FullCalendar stream is modelled on FullCalendar issue #7998; the Cal.com stream is modelled on Cal.com issue #30021.
- **Reveal_Step**: The event of a Blind hunt Case at which the hidden public issue is shown and the Case_Board marks whether the Crew's finding matches it.
- **Fixed_Version_Check**: An event in which the same assertion that failed on the affected Target_Version is run on a fixed or patched Target_Version.
- **Suggested_Fix**: Doctor Stitch's proposed change and regression test for a Case, shown as a small diff and labelled "Suggested fix".
- **Version_History_Strip**: The small strip on each Case_Card that lists the Target_Versions the Case touched and the result on each.
- **Version_Timeline**: The version-history timeline at the top of the Case_View, drawn as a branch of the Timeline_Thread. It shows five Version_Milestones of the selected Case in this order: version released, issue reported, reproduced by the Crew on the affected version, fix suggested, fixed version verified (decision D21).
- **Version_Milestone**: One entry of the Version_Timeline. A history milestone (version released, issue reported) carries a calendar date only when that date comes from a published release or the public issue tracker; a replay milestone (reproduced, fix suggested, fixed version verified) refers to one event of the Mock_Event_Stream instead of a calendar date.
- **Evidence_Ladder**: The ordered status scale Planned, Observed anomaly, Reproduced, Known-issue match, Fixed-version verified, plus the separate status Inconclusive.
- **Art_Pipeline**: The set of scripts and procedures that turn generated images into approved transparent assets.
- **Cutout_Script**: The Python script that trims and cleans a generated transparent image (or, on the chroma-key backup route, removes the key background), places it on the master canvas, writes the manifest entry, and runs alpha checks.
- **Asset_Manifest**: The JSON file that lists each asset with its path, size, and pivot point.
- **Asset_QA_Page**: A development-only page in the Frontend that displays every asset on light and dark backgrounds for review.
- **Codex_CLI**: The command-line image generator invoked as `codex.cmd`.
- **OpenCode_CLI**: The command-line coding agent invoked as `opencode.cmd`.
- **Design_Tokens**: The CSS custom properties that define color, type, and spacing for the Frontend.
- **Style_Bible**: The shared prompt text, used in every Codex_CLI request, that defines the art style.
- **Pilot_Pack**: The first asset batch, containing full poses of Mini Bat, Wraith Director and Doctor Stitch only, used for style approval before any layered rig parts or other Mascots are generated.
- **Placeholder_Link**: A link whose target is a clearly marked stand-in value kept in one configuration file for easy replacement.

## Requirements

### Requirement 1: Single-page scope and mock data

**User Story:** As a hackathon judge, I want one polished app screen, so that I can judge the experience without hitting unfinished screens.

#### Acceptance Criteria

1. THE Frontend SHALL render exactly one route, the Case_Board.
2. THE Case_Board SHALL source all displayed live-style data (checklist statuses, gateway status, case statuses, replay events, version results, evidence statuses, suggested fixes) from static mock data bundled with the Frontend or from Draft_Cases stored in localStorage.
3. THE Frontend SHALL make no network requests to a TimeWraith backend, to a Target, to a repository host, or to an issue URL entered by the user.
4. THE Case_Board SHALL contain the seven Sections in this order: Open_Case_Panel, Lost_Hour, Case_Library, Case_View, Crew, Investigation_Flow, Closing. (Revised; was: Hero, Problem, Crew, Investigation_Flow, Replay_Lab, Proof, Final_CTA.)
5. THE Frontend SHALL reside in the `frontend/` directory and use Vite, React 19, TypeScript, and pnpm.
6. THE Frontend SHALL use plain CSS with Design_Tokens and SHALL exclude Tailwind and component kits.
7. THE Case_Board SHALL position TimeWraith as an investigator of date and time behaviour in a Target the user brings, and SHALL NOT claim that TimeWraith finds arbitrary bugs on arbitrary websites.

### Requirement 2: Continuous narrative and Timeline Thread

**User Story:** As a visitor, I want one continuous story down the board, so that scrolling feels like following a case file through time.

#### Acceptance Criteria

1. THE Case_Board SHALL render the Timeline_Thread as a single hand-inked SVG line that spans from the Open_Case_Panel to the Closing.
2. THE Case_Board SHALL place one Section_Node on the Timeline_Thread for each Section, labelled with a date or time stamp.
3. WHEN the user scrolls, THE Timeline_Thread SHALL draw progressively so that the drawn length is proportional to the scroll position.
4. WHEN a Section enters the viewport, THE Case_Board SHALL play the reaction animation of that Section's Mascots once.
5. WHILE the user scrolls from the top to the bottom of the Case_Board, THE Case_Board SHALL transition the background from the tower-950 night palette to the moon-200 dawn palette of the Closing.
6. THE Mini_Ghost SHALL travel along the Timeline_Thread as a scroll companion and progress marker.
7. WHEN a Section_Node or a clock-stamp link in the App_Header is activated by click or keyboard, THE Case_Board SHALL scroll to the corresponding Section.
8. THE Case_Board SHALL render the Timeline_Thread without causing layout shift of the Section content.

### Requirement 3: Section content

**User Story:** As a visitor, I want each Section to explain one idea clearly, so that I understand what TimeWraith does and why it matters.

#### Acceptance Criteria

1. THE Open_Case_Panel SHALL display the headline "Bugs are hiding in time.", the subhead "Send your Crew to investigate date-boundary failures." and the positioning line "An autonomous regression investigator for date-sensitive apps." (Revised; was: THE Hero SHALL display the headline and the subhead.)
2. THE Open_Case_Panel SHALL display the Wraith Director as the one large figure beside the Clock, with the Watchtower Warden as a smaller figure near the Setup_Checklist. (Revised; was: THE Hero SHALL display Wraith Director and Watchtower Warden beside the Clock.)
3. THE Lost_Hour SHALL depict a daylight-saving-time night on the Timeline_Thread in which the time marker jumps from 01:59 to 03:00.
4. WHEN the Lost_Hour enters the viewport, THE Case_Board SHALL scatter Mini Bats from the 01:59 to 03:00 gap.
5. THE Crew Section SHALL display all 14 Mascots, each with its name and one line describing its job. (Revised; was 13 Mascots.)
6. THE Investigation_Flow SHALL present six steps in this order: scope, plan, approve, run, evidence, fix. (Revised; was five steps ending at evidence. See design decision D17.)
7. WHEN the approve step becomes active, THE Case_Board SHALL play a Bat_Burst at the approve step.
8. THE Investigation_Flow SHALL display the Crew_Agents and the System_Component_Mascots in sequence, each attached to the step in which that Mascot acts, with Doctor Stitch attached to the fix step.
9. Superseded by Requirement 8 and Requirement 22. Was: THE Proof SHALL display the Evidence_Ladder and the statement "Browser time ≠ server time".
10. THE Closing SHALL display the "Open a case" prompt, the secondary links, and the footer. (Revised; was: THE Final_CTA SHALL display the primary CTA, the secondary CTAs, and the footer.)
11. WHEN the Closing enters the viewport, THE Raven_Archivist SHALL play a stamp animation on the Closing sheet.

### Requirement 4: Mascot roster and section assignment

**User Story:** As a visitor, I want a recognisable cast, so that each part of the system has a memorable face.

#### Acceptance Criteria

1. THE Case_Board SHALL feature these 14 Mascots: Wraith Director (planner and user-facing host), Watchtower Warden (orchestration agent with a searchlight eye, handling dispatch, queue, and stop conditions), Bat Scout (explorer), Pumpkin Mechanic (time experimenter using the Playwright clock), Raven Archivist (verification agent), Doctor Stitch (patch-maker who stitches a Suggested_Fix and its regression test from the Raven's verified failure), Gargoyle Gatekeeper (permissions, allowlist, sandbox limits), Cauldron Cat (local sandbox runner), Spider Weaver (trace and event recorder who spins the Timeline_Thread), Mummy Wrapper (artifact hashing, redaction, manifest), Two-Faced Jack the scarecrow (version comparator for affected versus fixed), Skeleton Scribe (a hand only, report and regression-test export), Mini Bat (click bursts and node-to-node travel), and Mini Ghost (scroll companion and progress marker).
2. THE Frontend SHALL animate each Tier_1_Mascot from layered PNG parts using transforms.
3. THE Frontend SHALL give each Tier_2_Mascot a hero pose, an idle animation, and a hover or in-view reaction.
4. THE Frontend SHALL animate Bat flight with a 6-frame flap sprite stepped at 12 frames per second using CSS `steps()`.
5. THE Case_Board SHALL assign Mascots to Sections as follows, subject to refinement in design: Open_Case_Panel uses Wraith Director, Watchtower Warden and Mini Bat; Lost_Hour uses Mini Bat and Mini Ghost; Case_Library uses Skeleton Scribe and Mini Bat; Case_View uses Spider Weaver, Bat Scout, Pumpkin Mechanic, Raven Archivist, Two-Faced Jack, Mummy Wrapper and Doctor Stitch; Crew uses all Mascots; Investigation_Flow uses the Crew_Agents and System_Component_Mascots in sequence; Closing uses Raven Archivist and Skeleton Scribe. (Revised for the Case_Board.)
6. WHEN the user clicks the Case_Board background or a Section_Node, THE Mini_Bat SHALL fly to the clicked point as a click burst or travel to the targeted Section_Node.
7. WHEN the user hovers or focuses a Tier_2_Mascot, THE Frontend SHALL play the hover reaction of that Mascot.
8. IF a Mascot fails asset QA, THEN THE Frontend SHALL render a simpler pose of that Mascot instead of omitting the Mascot or blocking the build.
9. WHILE the Mini_Ghost passes behind a ledge, THE Frontend SHALL hide the occluded part of the Mini_Ghost using a foreground ledge mask asset.
10. THE Case_View SHALL draw Doctor Stitch's stitch line along the Suggested_Fix sheet as a continuation of Spider Weaver's scrubber thread and the Timeline_Thread, so that the three threads read as one line.

### Requirement 5: Clock entry sequence and calls to action

**User Story:** As a visitor, I want a dramatic opening, so that the board feels alive in the first second.

#### Acceptance Criteria

1. WHEN the Case_Board finishes loading, THE Clock SHALL run one hand-entry sequence lasting between 500 ms and 650 ms.
2. Superseded by Requirement 20.1 and 20.2 (honest submit of the Open_Case_Form). Was: THE Hero SHALL display the primary CTA labelled "Enter the Clocktower" together with the note "App opens in the next milestone".
3. Superseded by Requirement 20.1 (submit plays the Bat_Burst). Was: WHEN the user activates the primary CTA, THE Landing_Page SHALL play a Bat_Burst and the Clock hand-entry sequence.
4. Superseded by Requirement 20.10 (focus and scroll to the new Draft_Case card). Was: WHEN the Bat_Burst and the hand-entry sequence complete, THE Landing_Page SHALL scroll smoothly to the Replay_Lab.
5. WHEN the user submits the Open_Case_Form, selects a Case_Card or activates the Closing prompt, THE Case_Board SHALL remain on the same URL path.
6. THE Closing SHALL display a secondary link labelled "Watch the 3-minute demo" and a secondary link labelled "View source on GitHub". (Revised; was: THE Hero SHALL display the secondary CTAs.)
7. THE Frontend SHALL implement the demo link and the GitHub link as Placeholder_Links, defined in a single configuration file and each visibly marked as a placeholder in the interface, for example by a footnote mark after the link text that refers to a visible footnote, and SHALL remove the mark and the footnote when the link is no longer a placeholder.
8. WHEN the user activates the Closing prompt "Open a case", THE Case_Board SHALL scroll to the Open_Case_Panel and move focus to the first field of the Open_Case_Form. (Revised; was: THE Final_CTA SHALL repeat the primary CTA and the secondary CTAs with the same labels, behavior, and note as the Hero.)

### Requirement 6: Setup checklist and gateway status honesty

**User Story:** As a visitor, I want the board to be honest about what is simulated, so that I trust the claims.

#### Acceptance Criteria

1. THE Open_Case_Panel SHALL display the Setup_Checklist under the label "Demo mode, simulated status".
2. THE Setup_Checklist SHALL list simulated checks with a status for each, taken from mock data.
3. THE Case_Board SHALL present no Setup_Checklist status and no Gateway_Status_Badge state as the result of a live check.
4. THE Case_Board SHALL show the label "Demo mode, simulated status" in the same visual region as the Setup_Checklist at every viewport width.
5. THE App_Header SHALL display the Gateway_Status_Badge with the text "Demo mode, simulated status" at every viewport width.

### Requirement 7: Recorded Replay of a case

**User Story:** As a visitor, I want to scrub through an example investigation, so that I can see how the Crew captures evidence over time.

#### Acceptance Criteria

1. THE Replay_Lab SHALL display the Recorded_Replay of the selected Sample_Case as a scrubbable timeline built from that case's Mock_Event_Stream.
2. THE Replay_Lab SHALL label each Recorded_Replay with its case's sample label: "Sample replay (illustrative data), not a real finding" for FullCalendar #7998 and "Illustrative replay modelled on the public report, not a real recorded run" for Cal.com #30021. (Revised; was one label for the single replay.)
3. Each Mock_Event_Stream SHALL contain between 8 and 20 events; the FullCalendar stream SHALL be modelled on FullCalendar issue #7998, a time-zone date-boundary case, and the Cal.com stream SHALL be modelled on Cal.com issue #30021, a server-side DST case. (Revised; was the FullCalendar stream only.)
4. THE Replay_Lab SHALL display a link to the selected case's public issue (https://github.com/fullcalendar/fullcalendar/issues/7998 or https://github.com/calcom/cal.com/issues/30021) as a credibility anchor, subject to Requirement 23.2 for Blind hunt cases.
5. WHEN the user drags or clicks the scrubber, THE Replay_Lab SHALL update the displayed event, timestamp, Target_Version and clock value to match the scrubber position.
6. WHEN the scrubber has focus and the user presses the Right Arrow or Left Arrow key, THE Replay_Lab SHALL move to the next or previous event respectively.
7. WHEN the scrubber has focus and the user presses the Home or End key, THE Replay_Lab SHALL move to the first or last event respectively.
8. THE Replay_Lab SHALL provide visible previous-event and next-event buttons that perform the same step actions as the arrow keys.
9. THE Replay_Lab SHALL use the mode label "Recorded replay" for the FullCalendar case and "Illustrative replay" for the Cal.com case, and SHALL NOT use the label "Live" for any replay. (Revised; was "Recorded replay" only.)
10. THE Replay_Lab SHALL use the phrase "Browser clock controlled" wherever the Case_Board describes the browser clock as set by the Crew, and SHALL NOT use the phrase "time travel enabled".
11. THE Replay_Lab SHALL display timestamps, Target_Versions and evidence values in the JetBrains Mono typeface.
12. WHEN the displayed event changes, THE Replay_Lab SHALL announce the new event text through an ARIA live region.
13. IF the scrubber receives a position outside the event range, THEN THE Replay_Lab SHALL clamp the position to the first or last event.

### Requirement 8: Proof over theatre (case-scoped)

**User Story:** As a visitor, I want to see how TimeWraith qualifies its claims for each case, so that I know a result is evidence and not theatre.

#### Acceptance Criteria

1. THE Case_View SHALL display the Evidence_Ladder of the selected Case in this order: Planned, Observed anomaly, Reproduced, Known-issue match, Fixed-version verified, with the rung reached at the current replay event marked. (Revised; was: THE Proof SHALL display the Evidence_Ladder.)
2. THE Case_View SHALL display Inconclusive as a status separate from the ordered steps of the Evidence_Ladder.
3. THE Case_View SHALL display a one-line definition for each Evidence_Ladder status.
4. THE Case_View SHALL display the statement "Browser time ≠ server time" together with an explanation that the browser clock and the server clock are controlled separately, and SHALL state how the selected Case controlled time (Requirement 26.5).
5. WHERE the Case_Board describes a result with no failing observation, THE Case_Board SHALL use the phrase "No anomaly observed in tested cases" and SHALL NOT use the phrase "No bugs found".
6. THE Case_View SHALL convey each Evidence_Ladder status by text label and shape in addition to color.

### Requirement 9: MotionDirector and animation layering

**User Story:** As a visitor, I want animation that supports reading, so that effects never collide or hide content.

#### Acceptance Criteria

1. THE Frontend SHALL route every narrative animation effect through the MotionDirector.
2. THE MotionDirector SHALL assign each effect one Priority_Level from P0, P1, P2, or P3.
3. THE MotionDirector SHALL run at most one major scene at a time.
4. THE MotionDirector SHALL run at most one ambient Companion effect per Section region at a time.
5. WHEN an effect with Priority_Level P0 is requested, THE MotionDirector SHALL cancel or yield every running effect with a lower priority.
6. WHEN an effect with Priority_Level P1 is requested, THE MotionDirector SHALL cancel running P3 effects.
7. WHEN a P2 effect request waits in the queue longer than 500 ms, THE MotionDirector SHALL drop the request.
8. WHILE the user is focused on a text input of the Open_Case_Form or the Replay_Lab scrubber, THE MotionDirector SHALL suppress P3 effects.
9. WHILE the browser tab is hidden, THE MotionDirector SHALL pause all P3 effects.
10. THE MotionDirector SHALL enforce a cooldown between consecutive P3 effects.
11. THE Frontend SHALL render roaming Mascots in the Overlay_Layer with pointer events disabled.
12. THE Frontend SHALL implement Mascot springs, sprite actors, and the MotionDirector queue with Motion (React), and SHALL implement the scroll-synced Timeline_Thread and pinned scenes with GSAP ScrollTrigger.
13. THE Frontend SHALL exclude Rive and Lottie.
14. THE Frontend SHALL animate positioned art with GPU-composited transforms and opacity so that animation causes no layout shift.

### Requirement 10: Reduce Motion

**User Story:** As a visitor sensitive to motion, I want to turn animation down, so that I can use the board comfortably.

#### Acceptance Criteria

1. THE Case_Board SHALL display the Reduce_Motion_Toggle in the App_Header.
2. WHEN the page loads with the `prefers-reduced-motion: reduce` media query matching, THE Case_Board SHALL start in Reduce_Motion_Mode.
3. WHEN the user activates the Reduce_Motion_Toggle, THE Case_Board SHALL switch Reduce_Motion_Mode on or off immediately and announce the new state through an ARIA live region.
4. WHILE Reduce_Motion_Mode is on, THE Frontend SHALL replace each Bat_Burst with a static state marker or a fade lasting at most 150 ms.
5. WHILE Reduce_Motion_Mode is on, THE Frontend SHALL keep the Mini_Ghost stationary at a fixed progress position.
6. WHILE Reduce_Motion_Mode is on, THE Frontend SHALL disable ambient looping animation.
7. WHILE Reduce_Motion_Mode is on, THE Frontend SHALL replace the Clock hand-entry sequence, the Timeline_Thread draw, the Raven stamp, the Blind hunt reveal, the fixed-version pass, the Doctor Stitch stitch-in, the Version_Milestone stamp and the Case_Card entry, creation and opening effects with their final static states or a fade lasting at most 150 ms.
8. WHILE Reduce_Motion_Mode is on, THE Case_Board SHALL perform every programmatic scroll (to a new Draft_Case card, to the Case_View, to the Open_Case_Panel) without smooth scrolling. (Revised; was: THE Primary CTA SHALL scroll to the Replay_Lab without smooth scrolling.)
9. THE Frontend SHALL define a Reduce_Motion_Mode fallback for every animation effect.
10. THE Reduce_Motion_Toggle SHALL show its current state as visible text, including when the state was set by the `prefers-reduced-motion` media query.

### Requirement 11: Accessibility and responsiveness

**User Story:** As a visitor using a keyboard, screen reader, or phone, I want the board to work for me, so that the experience is not limited to a desktop mouse user.

#### Acceptance Criteria

1. THE Case_Board SHALL allow every interactive control to be reached and activated with the keyboard in a logical order.
2. THE Case_Board SHALL display a visible focus indicator on every focusable element.
3. THE Case_Board SHALL use semantic HTML landmarks (header, nav, main, section, form, footer) and one h1 element.
4. THE Frontend SHALL provide alternative text for each informative image and an empty alt attribute for each decorative image.
5. THE Case_Board SHALL keep all meaningful text in the DOM and SHALL exclude text baked into PNG assets.
6. THE Case_Board SHALL render without horizontal scrolling at viewport widths from 360 px to 1920 px.
7. WHILE the viewport width is below 768 px, THE Case_Board SHALL show fewer Companions and fewer ambient effects than at wider viewports.
8. THE Case_Board SHALL achieve a contrast ratio of at least 4.5:1 for body text and at least 3:1 for large text and interface component boundaries.
9. THE Case_Board SHALL use pumpkin-600 only for large text, shapes, or decoration, and SHALL exclude pumpkin-600 as small text on paper-100 or parchment-200 backgrounds.
10. THE Case_Board SHALL convey every state (including Case status, Case_Mode, version result and diff line type) by text or shape in addition to color.

### Requirement 12: Visual design system

**User Story:** As a hackathon judge, I want a distinctive look, so that the board does not resemble a generic template.

#### Acceptance Criteria

1. THE Frontend SHALL define in Design_Tokens exactly these named colors: tower-950 #24251F, ink-900 #292720, walnut-700 #4D4336, paper-100 #F8F0DE, parchment-200 #ECE1CA, divider-300 #D0C4AE, pumpkin-600 #B7683C, gold-500 #B79557, sage-700 #526B50, brick-700 #913E33, moon-200 #E8D9BC, and mist-300 #A9B8B8.
2. THE Frontend SHALL define spacing in Design_Tokens as multiples of 4 px and 8 px.
3. THE Case_Board SHALL use IM Fell English for Section headings at weight 400 only, with no bold headings, and SHALL express heading hierarchy by size and italics.
4. THE Case_Board SHALL use Libre Franklin for interface text, including form labels, inputs, buttons and error messages.
5. THE Case_Board SHALL use JetBrains Mono for evidence values, timestamps, Target_Versions, URLs inside evidence, and diffs.
6. THE Case_Board SHALL display the TimeWraith wordmark as hand-lettered generated art with an accessible text name "TimeWraith".
7. THE Case_Board SHALL exclude purple gradients, cyan gradients, neon glow, glassmorphism, and nested rounded cards (a rounded card inside another rounded card).
8. THE Case_Board SHALL use a layout that follows the Timeline_Thread and the Section_Nodes instead of a uniform grid of identical cards.
9. THE Frontend SHALL load web fonts with `font-display: swap` and SHALL provide fallback system fonts.
10. THE Case_Board SHALL apply hard offset shadows and the 2 px ink outline only to interactive controls (buttons, the Reduce_Motion_Toggle, form inputs, Case_Card select buttons, the scrubber and its controls, and Tier 2 mascot buttons), and SHALL NOT apply them to static containers.
11. THE Case_Board SHALL NOT display uppercase micro-labels (eyebrows, step kickers, counters, or label prefixes set with `text-transform: uppercase`), and THE style guard SHALL flag `text-transform: uppercase` unless the line is explicitly allowed.
12. THE Case_Board SHALL keep a night-heavy layout with the twelve Design_Tokens colors: tower-950 and walnut-700 Section backgrounds through the Investigation_Flow, cream (paper-100, parchment-200) only for paper objects, and the moon-200 dawn background only in the Closing.

### Requirement 13: Art asset pipeline

**User Story:** As the project owner, I want a repeatable asset pipeline, so that every character is consistent and ready to animate.

#### Acceptance Criteria

1. THE Art_Pipeline SHALL request one isolated subject per Codex_CLI request using the Style_Bible, with the background mode (true transparent alpha, preferred, or a flat `#FF00FF` chroma key as the backup) decided by `docs/tool-check.md`, and SHALL NOT mix both background modes in one request. (Revised; was: on a flat chroma-key background.)
2. THE Style_Bible SHALL specify hand-inked and cel-painted rendering and Crooked Cartoon Mischief silhouettes, and SHALL prohibit neon glow, baked text, and collage boards.
3. THE Art_Pipeline SHALL store assets under `frontend/assets/{masters,cutouts,frames,scenery,effects,manifests,qa}`.
4. THE Art_Pipeline SHALL retain the source master image for every approved asset.
5. WHEN the Cutout_Script processes a transparent master image, THE Cutout_Script SHALL snap alpha values of 240 or more to 255, set stray alpha values of 8 or less to 0, trim transparent margins, place the subject on the master canvas, resize with premultiplied alpha, export WebP of at most 300 KB, and write the asset path, pixel size, and pivot point to the Asset_Manifest; WHEN it processes a chroma-key master, THE Cutout_Script SHALL first remove the key background to true alpha. (Revised; was: remove the chroma-key background, trim, and write the manifest entry.)
6. IF the Cutout_Script finds fringe pixels of the chroma-key color, fully opaque corners, or no transparent pixels in a cutout, THEN THE Cutout_Script SHALL mark the asset as failed in the Asset_Manifest and report the reason.
7. THE Frontend SHALL include an Asset_QA_Page that displays every asset in the Asset_Manifest on light and dark backgrounds.
8. THE Art_Pipeline SHALL generate the Pilot_Pack (full poses of Mini Bat, Wraith Director and Doctor Stitch) and obtain user approval of the style before generating layered rig parts or any other Mascot. (Revised; was Mini Bat and Wraith Director. See decision D22.)
9. THE Frontend SHALL use SVG only for non-character items: the Timeline_Thread, flight paths, clock hands, ink cracks and stitch lines.
10. THE Clock SHALL use a painted art face with separate SVG hands.
11. THE Art_Pipeline SHALL produce a foreground ledge mask asset for the Mini_Ghost occlusion described in Requirement 4.
12. IF a Mascot remains below QA after two regeneration attempts, THEN THE Art_Pipeline SHALL record the Mascot as using a simpler pose and continue with the remaining Mascots.
13. THE Art_Pipeline SHALL generate Doctor Stitch's Tier 1 rig parts (body, needle arm, eyes) after Pilot_Pack approval.

### Requirement 14: Tool availability and fallbacks

**User Story:** As the project owner, I want the plan to survive tool failures, so that the build is not blocked by an unavailable generator or agent.

#### Acceptance Criteria

1. THE first implementation task SHALL test one Codex_CLI image generation and record whether Codex_CLI can generate an image.
2. IF Codex_CLI cannot generate an image, THEN THE Art_Pipeline SHALL use a documented fallback source for the Pilot_Pack and later assets, and the Frontend SHALL still build and run with placeholder art.
3. THE implementation plan SHALL confirm that OpenCode_CLI runs before assigning scaffolding work to OpenCode_CLI.
4. IF OpenCode_CLI is unavailable, THEN THE implementation plan SHALL assign the OpenCode_CLI scaffolding work (the Cutout_Script, the sprite and rig components, and the Asset_QA_Page) to the primary coding agent.
5. THE implementation SHALL invoke the tools through the `codex.cmd` and `opencode.cmd` shims.

### Requirement 15: Build phases and verification

**User Story:** As the project owner, I want working UI early and tested at each phase, so that I can see progress and trust the result.

#### Acceptance Criteria

1. THE implementation plan SHALL deliver a visible Case_Board skeleton with placeholder art before generating the full Mascot cast.
2. THE implementation plan SHALL order work in phases, with automated tests run after each phase.
3. THE Frontend SHALL include unit tests for the MotionDirector priority, cap, and cooldown rules.
4. THE Frontend SHALL include unit tests for the Recorded_Replay step, clamp, and keyboard behavior.
5. THE Frontend SHALL include a test that every animation effect has a Reduce_Motion_Mode fallback.
6. THE Frontend SHALL include an automated contrast check of the Design_Tokens color pairs used for text.
7. WHEN the Frontend build completes, THE implementation plan SHALL run a Lighthouse audit and capture screenshots at 360 px, 768 px, and 1440 px widths.
8. THE Lighthouse audit SHALL report an accessibility score of at least 95 and a performance score of at least 80 on the production build in the desktop profile.
9. THE Frontend SHALL build with zero TypeScript errors and zero lint errors.
10. THE Frontend SHALL include tests for the Open_Case_Form validation rules, the Draft_Case storage round-trip, and the Blind hunt reveal honesty rule.

### Requirement 16: Copy and honesty rules

**User Story:** As a visitor, I want consistent, honest wording, so that no claim is overstated.

#### Acceptance Criteria

1. THE Case_Board SHALL use the phrase "No anomaly observed in tested cases" where a negative result is described.
2. THE Case_Board SHALL use "Recorded replay" or "Illustrative replay" for pre-authored replay data and "Live" only for a state that is produced by a live system.
3. THE Case_Board SHALL use "Browser clock controlled" to describe browser clock control.
4. THE Case_Board SHALL label every mock data region, including each Sample_Case and its Case_Card, as sample, illustrative, or simulated.
5. THE Case_Board SHALL present FullCalendar issue #7998 and Cal.com issue #30021 as real third-party public reports that the Crew re-investigates, and SHALL NOT claim either as a new finding by TimeWraith. (Revised; was FullCalendar #7998 only.)
6. THE Case_Board SHALL label the Cal.com replay events as illustrative and modelled on the public report, and SHALL NOT present them as a real recorded run.
7. THE Case_Board SHALL label every Draft_Case "Draft, not run: cases run in the next milestone" and SHALL NOT present a Draft_Case as run.
8. THE Case_Board SHALL NOT describe a Suggested_Fix as merged, and SHALL describe it as verified only under the condition of Requirement 24.4.
9. THE Case_Board SHALL NOT display a commit hash, release or test count that does not come from a public report, a published release of the Target, or the user's own input.
10. THE Case_Board SHALL use the label "Recorded investigation replay" only for a Recorded_Investigation_Replay, and SHALL NOT use it for either Sample_Case.
11. THE Case_Board SHALL NOT present a simulated or hand-authored step, a Blind_Benchmark outcome or a Suggested_Fix of a Sample_Case as the result of a real Kiro Crew run, and SHALL cite the public report as the source of each Sample_Case.
12. THE Case_Board SHALL NOT display a Version_Milestone date that does not come from a published release of the Target or the public issue tracker record of the issue.

### Requirement 17: Footer, credits, and hackathon deliverables

**User Story:** As a hackathon organizer, I want the repository to meet the submission rules, so that the entry is eligible.

#### Acceptance Criteria

1. THE footer SHALL credit Kiro Crew, the Playwright Clock documentation, and Kiroween 2026.
2. THE repository SHALL contain a `.kiro` directory at the repository root.
3. THE repository SHALL contain a license file at the repository root that holds an OSI-approved open-source license chosen by the user, and the license SHALL be visible in the repository About section.
4. THE repository SHALL contain a README that includes a Kiro-usage write-up describing how Kiro specs, steering, and hooks were used.
5. THE repository SHALL contain a README section that documents the setup commands, the asset pipeline commands, and the test commands.
6. THE repository SHALL be organized so that the `frontend/` and `assets` directories match the layout in section 12.2 of the design document.
7. THE repository documentation SHALL record three Kiroween hackathon categories, with Costume Contest as the lead category for the UI and Frankenstein and Resurrection as supporting angles, and SHALL describe each angle as follows:
   - Costume Contest: the hand-inked, cel-painted UI and the Mascot cast.
   - Frankenstein: the Crew of agents (planner, orchestrator, explorer, experimenter, verifier, and Doctor Stitch the patch-maker) stitched to Playwright clock control, a sandbox runner, and a version comparator.
   - Resurrection: old, forgotten date-boundary bugs from public issue trackers (such as FullCalendar #7998 and Cal.com #30021) revived as reproducible evidence on pinned historical versions.
8. THE README SHALL state the lead category and present the other two categories as supporting angles, because Devpost may require choosing one primary category, and the README task SHALL re-read the 2026 rules to confirm whether multiple categories are allowed.

### Requirement 18: Performance

**User Story:** As a visitor on an average laptop or phone, I want the board to load and scroll smoothly, so that the animation adds to the experience.

#### Acceptance Criteria

1. THE Frontend SHALL serve raster Mascot assets as optimized images in WebP or PNG format, with each single asset not exceeding 300 KB.
2. THE Frontend SHALL lazy-load Mascot assets for Sections below the Open_Case_Panel.
3. THE Frontend SHALL reserve width and height for every image so that Cumulative Layout Shift stays at or below 0.1.
4. WHILE the user scrolls, THE Case_Board SHALL sustain a frame rate of at least 50 frames per second on a mid-range laptop in the desktop profile.
5. THE Open_Case_Panel SHALL display the headline and subhead within 2 seconds on the Lighthouse desktop profile before decorative art finishes loading.

### Requirement 19: Open_Case_Form

**User Story:** As a developer with a date-sensitive app, I want to bring my own target to the Crew, so that I can see that TimeWraith is not tied to one product.

#### Acceptance Criteria

1. THE Open_Case_Panel SHALL display the Open_Case_Form with these fields: target type (Git repository or local app), repository URL, Target_Version, local app URL, date-sensitive area, Case_Mode, and public issue URL.
2. WHILE the target type is Git repository, THE Open_Case_Form SHALL require a repository URL and a Target_Version and SHALL hide the local app URL field.
3. WHILE the target type is local app, THE Open_Case_Form SHALL require a local app URL and SHALL hide the repository URL and Target_Version fields.
4. THE Open_Case_Form SHALL offer the three Case_Modes Known issue, Blind hunt and Open hunt as one radio group, each option with a one-line description of what the Crew is given.
5. WHILE the selected Case_Mode is Known issue or Blind hunt, THE Open_Case_Form SHALL require a public issue URL.
6. WHILE the selected Case_Mode is Open hunt, THE Open_Case_Form SHALL hide the issue URL field and SHALL NOT store an issue URL with the Case.
7. THE Open_Case_Form SHALL treat the date-sensitive area as optional free text of at most 200 characters.
8. IF the repository URL is not an `https` URL with a host and at least an owner and a repository path segment, or contains user credentials, a query string or a fragment, THEN THE Open_Case_Form SHALL reject the value with a field error.
9. IF the Target_Version is neither a commit hash of 7 to 40 hexadecimal characters nor a valid tag or branch name (no spaces, no `..`, no leading `-` or `/`, no trailing `/`, `.` or `.lock`, at most 100 characters), THEN THE Open_Case_Form SHALL reject the value with a field error.
10. IF the local app URL is not an `http` or `https` URL whose host is `localhost`, a name ending in `.localhost`, `127.0.0.1` or `[::1]`, THEN THE Open_Case_Form SHALL reject the value with a field error that says only local apps can be brought in.
11. IF the issue URL is not an `https` URL whose path ends in an issue number (`/issues/<number>` or `/-/issues/<number>`), THEN THE Open_Case_Form SHALL reject the value with a field error.
12. WHEN a field loses focus after its value changed, THE Open_Case_Form SHALL validate that field, and WHEN the user submits, THE Open_Case_Form SHALL validate every visible field.
13. WHEN a submission fails validation, THE Open_Case_Form SHALL show an error summary that lists each error as a link to its field, move focus to the summary, and keep every entered value.
14. THE Open_Case_Form SHALL give every field a visible label, mark each invalid field with `aria-invalid="true"`, and connect each error message to its field with `aria-describedby`.
15. THE Open_Case_Form SHALL be fully operable by keyboard, with the Case_Mode and target type radio groups following native arrow-key behaviour.
16. THE Open_Case_Form SHALL trim leading and trailing whitespace before validation and SHALL render user input as text only.
17. THE Open_Case_Panel SHALL state next to the form that the Target and issue URL are not contacted in demo mode.

### Requirement 20: Honest submit and Draft_Cases

**User Story:** As a visitor trying the form, I want submit to be honest, so that I never think a run happened when it did not.

#### Acceptance Criteria

1. WHEN the user submits a valid Open_Case_Form, THE Case_Board SHALL create a Draft_Case, play the Bat_Burst from the submit button, and add a Case_Card for the Draft_Case to the Case_Library.
2. THE Case_Board SHALL label every Draft_Case, its Case_Card and its Case_View "Draft, not run: cases run in the next milestone".
3. THE Case_Board SHALL NOT show replay events, an Evidence_Ladder rung, a version result other than "not run", or a Suggested_Fix for a Draft_Case, and SHALL NOT present a Draft_Case as running, queued or completed.
4. THE Case_Board SHALL store Draft_Cases only in the browser's localStorage under one versioned key and SHALL send no Draft_Case data over the network.
5. WHEN the Case_Board loads, THE Case_Library SHALL restore the stored Draft_Cases after the Sample_Cases, newest first.
6. IF the stored draft data is missing, unreadable, of an unknown schema version, or contains an invalid entry, THEN THE Case_Board SHALL skip the unreadable data or entry, keep the Sample_Cases, and continue without an error dialog.
7. IF localStorage is unavailable or full, THEN THE Case_Board SHALL keep the new Draft_Case for the current visit only and show "Not saved: browser storage unavailable" on its Case_Card.
8. IF the user submits while 20 Draft_Cases already exist, THEN THE Case_Board SHALL keep the existing Draft_Cases, create no new one, and show a message that the draft limit is reached.
9. THE Case_Card of a Draft_Case SHALL offer a "Remove draft" control that deletes that Draft_Case from localStorage and from the Case_Library.
10. WHEN a Draft_Case is created, THE Case_Board SHALL announce "Draft case created, not run" through the polite live region, scroll the new Case_Card into view, and move focus to it.

### Requirement 21: Case_Library

**User Story:** As a visitor, I want to see the cases on the board, so that I can pick one and inspect how the Crew worked it.

#### Acceptance Criteria

1. THE Case_Library SHALL list the Sample_Cases FullCalendar #7998 and Cal.com #30021 first, followed by the Draft_Cases.
2. THE Case_Library SHALL show on each Case_Card the case title, the Case_Mode, the Target (repository and Target_Version, or local app URL), the status on the Evidence_Ladder or "Draft, not run", and a Version_History_Strip.
3. THE Case_Library SHALL show the sample label of each Sample_Case on its Case_Card.
4. WHEN the user activates a Case_Card, THE Case_Board SHALL show that Case in the Case_View without changing the URL, mark that card as the current case, move focus to the Case_View heading, and announce "Case opened" with the case title through the polite live region.
5. WHEN the Case_Board loads, THE Case_View SHALL show the FullCalendar #7998 Sample_Case.
6. THE Case_Library SHALL mark exactly one Case_Card as the current case at any time.
7. WHERE the Case_Card belongs to a Blind hunt Case, THE Case_Card SHALL show "Issue hidden until the reveal" instead of the issue number, title or link.
8. WHERE filters by Case_Mode and status are included, THE Case_Library SHALL filter the cards without changing the Case shown in the Case_View.

### Requirement 22: Case_View and two-track replay

**User Story:** As a visitor, I want to see what the Crew did and against which version and clock, so that the evidence is tied to a pinned version.

#### Acceptance Criteria

1. THE Case_View SHALL show the selected Case's title, Case_Mode, Target, sample label, the Version_Timeline (Requirement 28), the Replay_Lab, the Evidence_Ladder, the time-control statement and the Suggested_Fix.
2. THE Replay_Lab SHALL show two tracks on one scrubbable timeline: the Event_Track and the Version_Clock_Track.
3. THE Version_Clock_Track SHALL show, for every event, the Target_Version the event ran against and the controlled clock value or time-zone setting the event used.
4. WHEN the scrubber moves to an event, THE Replay_Lab SHALL mark the entries of that same event on both tracks.
5. THE Replay_Lab SHALL use one scrubber, one set of step buttons, one keyboard mapping and one live region for both tracks.
6. WHERE a Case's Mock_Event_Stream contains a passed Fixed_Version_Check, THE Replay_Lab SHALL present the failure on the affected Target_Version followed by the pass on the fixed Target_Version as the climax of the replay, naming both versions.
7. WHERE a Case's Mock_Event_Stream contains no passed Fixed_Version_Check, THE Case_View SHALL state "Fixed-version check not run" or the recorded result, and the Evidence_Ladder SHALL NOT mark Fixed-version verified.
8. WHEN the Case_View shows a Draft_Case, THE Case_View SHALL show the Target, the Case_Mode and the label "Draft, not run: cases run in the next milestone" in place of the Replay_Lab tracks.
9. WHEN the selected Case changes, THE Replay_Lab SHALL reset the scrubber to the first event of the new Case.

### Requirement 23: Blind hunt reveal

**User Story:** As a judge, I want to see the Crew find a bug without being told the answer, so that a match with the public report means something.

#### Acceptance Criteria

1. WHERE the selected Case is a Blind hunt Case, THE Mock_Event_Stream SHALL contain exactly one Reveal_Step, placed after the Crew's reproduced finding.
2. WHILE the scrubber is before the Reveal_Step of a Blind hunt Case, THE Case_View SHALL NOT display the hidden issue's number, title or link in visible text or in accessible names.
3. WHEN the scrubber reaches the Reveal_Step, THE Case_View SHALL show the hidden issue as a real third-party public report with its link, and the outcome "Same behaviour as the public report" or "Did not match".
4. THE Case_View SHALL take the reveal outcome from the Case data and SHALL show "Did not match" when the data records no match.
5. WHERE a Fixed_Version_Check follows the Reveal_Step, THE Replay_Lab SHALL show it after the Reveal_Step.
6. WHEN the Reveal_Step becomes the current event, THE Replay_Lab SHALL announce the outcome through the polite live region.

### Requirement 24: Doctor Stitch and the Suggested_Fix

**User Story:** As a maintainer, I want a proposed patch with its regression test, so that a verified failure leads somewhere useful.

#### Acceptance Criteria

1. THE Case_View SHALL show Doctor Stitch's Suggested_Fix for each Sample_Case as a small diff of the proposed change and a diff of the regression test.
2. THE Case_View SHALL label every Suggested_Fix "Suggested fix".
3. WHERE an upstream fix exists for the Case (a merged change or a fix described in the public report), THE Case_View SHALL show it next to the Suggested_Fix, labelled with its source and linked.
4. THE Case_View SHALL describe a Suggested_Fix as verified only WHERE the Case's Mock_Event_Stream contains a passed Fixed_Version_Check on a Target_Version that includes that fix, and SHALL NOT describe any Suggested_Fix as merged.
5. WHERE no upstream fix is known for the Case, THE Case_View SHALL state "No upstream fix found".
6. WHERE a diff is illustrative and not taken from the Target's source code, THE Case_View SHALL label the diff "Illustrative diff".
7. THE Case_View SHALL render diffs as DOM text in JetBrains Mono, marking each added and removed line by a text marker and an accessible description in addition to color.

### Requirement 25: Version_History_Strip

**User Story:** As a visitor scanning the library, I want each case to show which versions were checked, so that I can see at a glance whether a fix was confirmed.

#### Acceptance Criteria

1. THE Case_Card SHALL show a Version_History_Strip that lists the Target_Versions the Case touched, in the order they were checked, each with one result: fails, passes, not run, or inconclusive.
2. THE Version_History_Strip SHALL convey each result by text and shape in addition to color.
3. WHERE the Case is a Draft_Case, THE Version_History_Strip SHALL show the Target_Version or local app URL the user entered with the result "not run".
4. THE Version_History_Strip SHALL list the same Target_Versions as the Version_Clock_Track of the same Case.
5. WHERE a Target_Version pin in a Sample_Case is illustrative and not taken from the public report or a published release, THE Version_History_Strip SHALL label it "illustrative pin".

### Requirement 26: Sample cases and time control

**User Story:** As a judge, I want the two sample cases to be faithful to their public reports, so that the demo is credible.

#### Acceptance Criteria

1. THE FullCalendar Sample_Case SHALL be a Known issue Case for a browser-side time-zone date-boundary failure, using the Mock_Event_Stream modelled on FullCalendar #7998 and the affected version named in that report.
2. THE Cal.com Sample_Case SHALL be a Blind hunt Case modelled on Cal.com #30021: a server-side DST failure in `processWorkingHours` (`packages/features/schedules/lib/date-ranges.ts`) in which an America/New_York 1 PM to 6 PM schedule is produced as 18:00 to 23:00 UTC instead of 17:00 to 22:00 UTC on 2026-03-08.
3. THE Cal.com Mock_Event_Stream SHALL include the report's explanation that afternoon start times are probed as a 12-hour value, that the existing DST tests used a 9 AM start, the failing unit test, and the fix with 192 tests green as stated in the report.
4. THE Case_Board SHALL label the Cal.com Sample_Case "Illustrative replay modelled on the public report, not a real recorded run".
5. THE Case_View SHALL state, for the Cal.com Sample_Case, that the browser clock alone cannot reach server time and that server time was controlled by the server time zone (TZ=UTC) and a unit-level test.
6. THE Case_View SHALL describe the time control of each event by its actual scope, "Browser clock controlled" for a browser clock set by the Crew and "Server time zone set" for a server-side setting, and SHALL NOT use "Browser clock controlled" for a server-side event.
7. THE Case_View SHALL link each Sample_Case to its public issue and SHALL present it as a third-party report that the Crew re-investigates.

### Requirement 27: Required animation

**User Story:** As a hackathon judge, I want to see the board move, so that the Costume Contest entry shows its craft.

#### Acceptance Criteria

1. WHILE Reduce_Motion_Mode is off, THE Case_Board SHALL play these effects: the Clock wake-up on load, the Bat_Burst on submitting a case and at the approve step, the Mini Ghost riding the Timeline_Thread, the Lost_Hour scene, the Crew roll-call and Tier 2 hover reactions, the Replay_Lab effects (Mini Bat flying peg to peg, the anomaly crack, the ladder rung lighting, the fixed-version pass, the Blind hunt reveal), Doctor Stitch stitching the diff in, the Version_Milestone stamp when the replay reaches a milestone, the Raven stamp, the Case_Cards entering the Case_Library, the Draft_Case card being created, and the selected Case opening.
2. THE Frontend SHALL route each effect listed in criterion 1 through the MotionDirector with a Reduce_Motion_Mode fallback.
3. THE Case_Board SHALL apply every state change (selected Case, new Draft_Case, current event, focus and announcements) at once, whether the matching effect runs, is dropped, or falls back.
4. THE end-to-end tests SHALL confirm in a browser, with Reduce_Motion_Mode off, that the Clock entry, the Bat_Burst and the case-opening effect change the transform or opacity of their elements over time, and, with Reduce_Motion_Mode on, that they show their final state without that animation.

### Requirement 28: Version_Timeline

**User Story:** As a judge, I want to see where a bug sits in the project's history, so that "Bugs are hiding in time" is shown as releases, reports, reproduction and fix rather than told.

#### Acceptance Criteria

1. THE Case_View SHALL show the Version_Timeline of the selected Sample_Case above the Replay_Lab, drawn as a branch of the Timeline_Thread, with exactly five Version_Milestones in this order: version released, issue reported, reproduced on the affected version, fix suggested, fixed version verified.
2. THE Version_Timeline SHALL show a calendar date on a history milestone only WHERE that date comes from a published release of the Target or from the public issue tracker record of the issue, and SHALL link that date to its source.
3. WHERE a history milestone has no such date (for example an illustrative pin), THE Version_Timeline SHALL show no date and SHALL label the milestone "illustrative pin" or "date not stated".
4. THE Version_Timeline SHALL show its dated milestones in chronological order.
5. THE Version_Timeline SHALL label each replay milestone with the replay event it refers to and with the sample label of the Case, and SHALL NOT give a replay milestone a calendar date.
6. WHEN the scrubber reaches or passes the event a replay milestone refers to, THE Version_Timeline SHALL mark that milestone reached by text and shape; WHILE the scrubber is before that event, THE Version_Timeline SHALL mark it not yet reached.
7. WHERE a Case's Mock_Event_Stream contains no passed Fixed_Version_Check, THE fixed-version milestone SHALL read "Fixed-version check not run" and SHALL never be marked reached.
8. WHILE the scrubber is before the Reveal_Step of a Blind hunt Case, THE issue-reported milestone SHALL read "Public report hidden until the reveal" and SHALL NOT show the issue's number, title, link or date in visible text or in accessible names.
9. THE Version_Timeline SHALL name only Target_Versions that are listed in the Case's versions, so that it agrees with the Version_Clock_Track and the Version_History_Strip.
10. WHEN the Case_View shows a Draft_Case, THE Version_Timeline SHALL show only the Target_Version or local app URL the user entered, with the label "Draft, not run: cases run in the next milestone".
