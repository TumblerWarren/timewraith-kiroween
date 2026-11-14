import { useEffect, useRef, type RefObject } from "react";
import wraith from "../../assets/cinematic/lantern-wraith.svg";

const ROUTE = [
  [.76, .18],
  [.28, .16],
  [.26, .27],
  [.24, .42],
  [.52, .46],
  [.78, .45],
  [.70, .58],
  [.28, .58],
  [.24, .77],
  [.55, .80],
  [.78, .84],
  [.76, .94],
  [.24, .94],
  [.52, .52],
] as const;
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function LanternWraith({ page, anchor, paused, reduced }: {
  readonly page: RefObject<HTMLElement | null>;
  readonly anchor: RefObject<HTMLDivElement | null>;
  readonly paused: boolean;
  readonly reduced: boolean;
}) {
  const ghost = useRef<HTMLDivElement>(null);
  const travel = useRef({ elapsed: 0, x: .76, y: .46 });

  useEffect(() => {
    const root = page.current;
    const figure = ghost.current;
    if (!root || !figure) return;
    const areas = Array.from(root.querySelectorAll<HTMLElement>("[data-lantern-reveal]"));
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
      const lampOffsetX = figure.offsetWidth * .14;
      const lampOffsetY = figure.offsetHeight * .05;
      const rect = anchor.current?.getBoundingClientRect();
      const artX = rect ? (rect.left - pageBox.left + rect.width * .52) / width : .76;
      const artY = rect ? (rect.top - pageBox.top + rect.height * .5) / height : .18;
      const mobile = width < 651;
      const dt = last ? clamp((now - last) / 1000, 0, .05) : 0;
      last = now;
      const introOpen = document.querySelector(".cinema[open]") !== null;

      if (reduced || state.elapsed === 0) {
        state.x = artX;
        state.y = artY;
      }
      if (!paused && !reduced && !introOpen) {
        state.elapsed += dt;
        const phase = Math.max(0, state.elapsed - 1.4) / 3.2;
        const start = ROUTE[Math.floor(phase) % ROUTE.length] ?? ROUTE[0];
        const end = ROUTE[(Math.floor(phase) + 1) % ROUTE.length] ?? ROUTE[0];
        const t = phase % 1;
        const progress = t * t * (3 - 2 * t);
        const idleX = phase ? lerp(start[0], end[0], progress) : artX;
        const idleY = phase ? lerp(start[1], end[1], progress) : artY;
        const target = destination && state.elapsed < destination.until ? {
          x: destination.x - lampOffsetX / width,
          y: destination.y - lampOffsetY / height,
        } : {
          x: pointer ? lerp(idleX, pointer.x, .16) : idleX,
          y: pointer ? lerp(idleY, pointer.y, .12) : idleY,
        };
        const follow = 1 - Math.exp(-dt * 2.6);
        state.x = lerp(state.x, target.x, follow);
        state.y = lerp(state.y, target.y, follow);
      }

      const roaming = !reduced && state.elapsed > 1.4;
      const respondingToClick = destination !== null && state.elapsed < destination.until;
      const x = roaming && !respondingToClick ? clamp(state.x, .16, .86) : state.x;
      const y = roaming && !respondingToClick ? clamp(state.y, .08, .96) : state.y;
      const bob = paused || reduced ? 0 : Math.sin(state.elapsed * 1.35) * 7;
      const lampX = x * width + lampOffsetX;
      const lampY = y * height + bob + lampOffsetY;
      const radius = Math.min(width * .55, mobile ? 240 : 380);

      if (!reduced && !introOpen) {
        for (const area of areas) {
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
          const t = visible ? clamp(1 - Math.hypot(dx, dy) / (radius * .85), 0, 1) : 0;
          const proximity = (t * t * (3 - 2 * t)).toFixed(2);
          if (area.style.getPropertyValue("--lantern-near") !== proximity) area.style.setProperty("--lantern-near", proximity);
          if (Number(proximity) > .58 && !area.hasAttribute("data-lantern-visited")) area.setAttribute("data-lantern-visited", "");
        }
      }
      figure.style.setProperty("--wraith-x", `${x * width}px`);
      figure.style.setProperty("--wraith-y", `${y * height + bob}px`);
      figure.style.setProperty("--wraith-opacity", roaming && x < (mobile ? .5 : .47) ? ".46" : ".94");
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
    const leave = () => { pointer = null; };
    const call = (event: MouseEvent) => {
      if (paused || reduced || !root || event.defaultPrevented || window.getSelection()?.isCollapsed === false) return;
      if (!(event.target instanceof Element) || event.target.closest("button,a,input,label,form,select,textarea,summary,[contenteditable],[role=tab]")) return;
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
