import { useEffect, useRef, type RefObject } from "react";
import wraith from "../../assets/cinematic/lantern-wraith.svg";

const ROUTE = [
  [0.76, 0.18],
  [0.28, 0.16],
  [0.26, 0.27],
  [0.24, 0.42],
  [0.52, 0.46],
  [0.78, 0.45],
  [0.7, 0.58],
  [0.28, 0.58],
  [0.24, 0.77],
  [0.55, 0.8],
  [0.78, 0.84],
  [0.76, 0.94],
  [0.24, 0.94],
  [0.52, 0.52],
] as const;

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const HOME_REVEALED_KEY = "tw:home-revealed";
const revealedIndices = new Set<number>();
let homePageRevealed = false;

function readPersistedReveal(): boolean {
  if (homePageRevealed) return true;
  try {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(HOME_REVEALED_KEY) === "all") {
      homePageRevealed = true;
      return true;
    }
  } catch {
    // Ignore storage errors
  }
  return false;
}

function persistAllRevealed(): void {
  homePageRevealed = true;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(HOME_REVEALED_KEY, "all");
    }
  } catch {
    // Ignore storage errors
  }
}

export function LanternWraith({
  page,
  anchor,
  paused,
  reduced,
}: {
  readonly page: RefObject<HTMLElement | null>;
  readonly anchor: RefObject<HTMLDivElement | null>;
  readonly paused: boolean;
  readonly reduced: boolean;
}) {
  const ghost = useRef<HTMLDivElement>(null);
  const travel = useRef({ elapsed: 0, x: 0.76, y: 0.46 });

  useEffect(() => {
    const root = page.current;
    const figure = ghost.current;
    if (!root || !figure) return;
    const areas = Array.from(root.querySelectorAll<HTMLElement>("[data-lantern-reveal]"));

    const markAreaVisited = (area: HTMLElement, index: number) => {
      revealedIndices.add(index);
      if (!area.hasAttribute("data-lantern-visited")) {
        area.setAttribute("data-lantern-visited", "");
      }
      area.style.setProperty("--lantern-near", "1");
    };

    const markAllRevealed = (container: HTMLElement) => {
      persistAllRevealed();
      container.setAttribute("data-lantern-complete", "true");
      areas.forEach((area, idx) => markAreaVisited(area, idx));
    };

    // Restore any previously revealed elements immediately when mounting or switching back to Home.
    if (readPersistedReveal()) {
      markAllRevealed(root);
    } else if (revealedIndices.size > 0) {
      areas.forEach((area, idx) => {
        if (revealedIndices.has(idx)) {
          markAreaVisited(area, idx);
        }
      });
    }

    let frame = 0;
    let last = 0;
    let pointer: { x: number; y: number } | null = null;
    let destination: { x: number; y: number; until: number } | null = null;
    const state = travel.current;

    function render(now: number) {
      if (!figure || !root) return;
      const pageBox = root.getBoundingClientRect();
      const width = root.clientWidth || window.innerWidth;
      const height = Math.max(root.offsetHeight, window.innerHeight);
      const lampOffsetX = figure.offsetWidth * 0.14;
      const lampOffsetY = figure.offsetHeight * 0.05;
      const rect = anchor.current?.getBoundingClientRect();
      const artX = rect ? (rect.left - pageBox.left + rect.width * 0.52) / width : 0.76;
      const artY = rect ? (rect.top - pageBox.top + rect.height * 0.5) / height : 0.18;
      const mobile = width < 651;
      const dt = last ? clamp((now - last) / 1000, 0, 0.05) : 0;
      last = now;
      const introOpen = document.querySelector(".cinema[open]") !== null;

      if (reduced || state.elapsed === 0) {
        state.x = artX;
        state.y = artY;
      }
      if (!paused && !reduced && !introOpen) {
        state.elapsed += dt;
        const phase = Math.max(0, state.elapsed - 1.4) / 3.2;
        if (!homePageRevealed && phase >= ROUTE.length) {
          markAllRevealed(root);
        }
        const start = ROUTE[Math.floor(phase) % ROUTE.length] ?? ROUTE[0];
        const end = ROUTE[(Math.floor(phase) + 1) % ROUTE.length] ?? ROUTE[0];
        const t = phase % 1;
        const progress = t * t * (3 - 2 * t);
        // Once the whole page is revealed, switch the ghost back to its hero anchor position.
        const idleX = homePageRevealed || !phase ? artX : lerp(start[0], end[0], progress);
        const idleY = homePageRevealed || !phase ? artY : lerp(start[1], end[1], progress);
        const target =
          destination && state.elapsed < destination.until
            ? {
                x: destination.x - lampOffsetX / width,
                y: destination.y - lampOffsetY / height,
              }
            : {
                x: pointer ? lerp(idleX, pointer.x, 0.16) : idleX,
                y: pointer ? lerp(idleY, pointer.y, 0.12) : idleY,
              };
        const follow = 1 - Math.exp(-dt * 2.6);
        state.x = lerp(state.x, target.x, follow);
        state.y = lerp(state.y, target.y, follow);
      }

      const roaming = !reduced && state.elapsed > 1.4 && !homePageRevealed;
      const respondingToClick = destination !== null && state.elapsed < destination.until;
      const x = roaming && !respondingToClick ? clamp(state.x, 0.16, 0.86) : state.x;
      const y = roaming && !respondingToClick ? clamp(state.y, 0.08, 0.96) : state.y;
      const bob = paused || reduced ? 0 : Math.sin(state.elapsed * 1.35) * 7;
      const lampX = x * width + lampOffsetX;
      const lampY = y * height + bob + lampOffsetY;
      const radius = Math.min(width * 0.55, mobile ? 240 : 380);

      if (!reduced && !introOpen && !homePageRevealed) {
        let allVisited = areas.length > 0;
        areas.forEach((area, idx) => {
          if (area.hasAttribute("data-lantern-visited")) {
            return;
          }
          const box = area.getBoundingClientRect();
          const hasBox = box.width > 0 && box.height > 0;
          const fallback = !hasBox ? area.closest(".midnight-workflow")?.getBoundingClientRect() : null;
          const activeBox = hasBox ? box : fallback;
          const visible = activeBox !== null && activeBox !== undefined && activeBox.width > 0 && activeBox.height > 0;
          const left = (activeBox?.left ?? 0) - pageBox.left;
          const right = (activeBox?.right ?? 0) - pageBox.left;
          const top = (activeBox?.top ?? 0) - pageBox.top;
          const bottom = (activeBox?.bottom ?? 0) - pageBox.top;
          const dx = Math.max(left - lampX, 0, lampX - right);
          const dy = Math.max(top - lampY, 0, lampY - bottom);
          const t = visible ? clamp(1 - Math.hypot(dx, dy) / (radius * 0.85), 0, 1) : 0;
          const numProximity = t * t * (3 - 2 * t);
          // Lock the text visible as soon as the lantern light reaches it so it never turns invisible again.
          if (numProximity > 0.12) {
            markAreaVisited(area, idx);
          } else {
            const proximity = numProximity.toFixed(2);
            if (area.style.getPropertyValue("--lantern-near") !== proximity) {
              area.style.setProperty("--lantern-near", proximity);
            }
            allVisited = false;
          }
        });
        if (allVisited) {
          markAllRevealed(root);
        }
      }
      figure.style.setProperty("--wraith-x", `${x * width}px`);
      figure.style.setProperty("--wraith-y", `${y * height + bob}px`);
      figure.style.setProperty("--wraith-opacity", roaming && x < (mobile ? 0.5 : 0.47) ? ".46" : ".94");
      if (!paused && !reduced && !document.hidden) frame = requestAnimationFrame(render);
    }
    const refresh = () => {
      cancelAnimationFrame(frame);
      last = 0;
      const image = figure.querySelector("img");
      const source = paused || reduced || document.hidden ? wraith : `${wraith}#animated`;
      if (image?.getAttribute("src") !== source) image?.setAttribute("src", source);
      if (!document.hidden) render(performance.now());
    };
    const point = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && root) {
        const pageBox = root.getBoundingClientRect();
        const width = root.clientWidth || innerWidth;
        const height = Math.max(root.offsetHeight, innerHeight);
        pointer = { x: (event.clientX - pageBox.left) / width, y: (event.clientY - pageBox.top) / height };
      }
    };
    const leave = () => {
      pointer = null;
    };
    const call = (event: MouseEvent) => {
      if (paused || reduced || !root || event.defaultPrevented || window.getSelection()?.isCollapsed === false) return;
      if (
        !(event.target instanceof Element) ||
        event.target.closest("button,a,input,label,form,select,textarea,summary,[contenteditable],[role=tab]")
      )
        return;
      const pageBox = root.getBoundingClientRect();
      const width = root.clientWidth || innerWidth;
      const height = Math.max(root.offsetHeight, innerHeight);
      destination = {
        x: (event.clientX - pageBox.left) / width,
        y: (event.clientY - pageBox.top) / height,
        until: state.elapsed + 4.5,
      };
    };
    root.addEventListener("pointermove", point);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("click", call);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, { passive: true });
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => {
      // When navigating away from Home, persist revealed state so switching back keeps all text visible.
      if (revealedIndices.size > 0) {
        persistAllRevealed();
      }
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", point);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("click", call);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [anchor, page, paused, reduced]);

  return (
    <div ref={ghost} className="landing-wraith" aria-hidden="true">
      <img src={paused || reduced ? wraith : `${wraith}#animated`} width="725" height="559" alt="" />
    </div>
  );
}
