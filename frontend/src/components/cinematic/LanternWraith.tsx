import { useEffect, useRef, useState } from "react";
import wraith from "../../assets/cinematic/lantern-wraith.jpg";

/** Keep the supplied spectral illustration; light and float are independently animated layers. */
export function LanternWraith() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    let visible = false;
    const update = () => setActive(visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; update(); });
    if (root.current) observer.observe(root.current);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <div ref={root} className="landing-wraith" data-active={active} aria-hidden="true">
    <img src={wraith} width="725" height="559" alt="" />
    <span className="landing-wraith__light" />
  </div>;
}
