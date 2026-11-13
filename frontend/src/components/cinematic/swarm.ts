/** Perspective flight from the supplied mockup; a single canvas keeps 245 bats off the DOM. */
export function createSwarm(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  let width = 1, height = 1, seed = 1337;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const bats = Array.from({ length: 245 }, (_, i) => ({
    start: 4.8 + random() * 1.8, life: 1.3 + random() * 1.05,
    angle: random() * Math.PI * 2, distance: .5 + random() * 1.3,
    size: 20 + random() * 43, phase: random() * 7,
    roll: (random() - .5) * 1.2, drift: (random() - .5) * .65, near: i < 32,
  }));
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(width * dpr); canvas.height = Math.ceil(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function bat(x: number, y: number, size: number, phase: number, rotation: number, alpha: number) {
    if (!ctx) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(size, size);
    ctx.globalAlpha = alpha; ctx.fillStyle = "#010101";
    const flap = .38 + .62 * Math.abs(Math.sin(phase));
    const tip = -.22 - .65 * Math.sin(phase);
    ctx.beginPath(); ctx.moveTo(-.09, -.05);
    ctx.bezierCurveTo(-.34, -.21 * flap, -.78, -.55 * flap, -1, tip);
    ctx.bezierCurveTo(-.86, .03 * flap, -.77, .15 * flap, -.64, .21 * flap);
    ctx.quadraticCurveTo(-.55, .02 * flap, -.44, .28 * flap);
    ctx.quadraticCurveTo(-.34, .10 * flap, -.24, .31 * flap);
    ctx.lineTo(-.07, .13); ctx.lineTo(-.02, .24); ctx.lineTo(.02, .24); ctx.lineTo(.07, .13);
    ctx.lineTo(.24, .31 * flap); ctx.quadraticCurveTo(.34, .10 * flap, .44, .28 * flap);
    ctx.quadraticCurveTo(.55, .02 * flap, .64, .21 * flap);
    ctx.bezierCurveTo(.77, .15 * flap, .86, .03 * flap, 1, tip);
    ctx.bezierCurveTo(.78, -.55 * flap, .34, -.21 * flap, .09, -.05);
    ctx.lineTo(.10, -.20); ctx.lineTo(.04, -.12); ctx.lineTo(-.04, -.12); ctx.lineTo(-.10, -.20);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function draw(time: number) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (time < 4.8 || time > 8.4) return;
    const visible = bats.flatMap(b => {
      const p = (time - b.start) / b.life;
      if (p <= 0 || p >= 1.12) return [];
      const distance = Math.max(width, height) * b.distance * p ** 2.65;
      const angle = b.angle + b.drift * p;
      return [{ b, p, x: width / 2 + Math.cos(angle) * distance,
        y: height / 2 + Math.sin(angle) * distance,
        size: b.size * (.15 + p ** 3.2 * 11) * (b.near ? 1.8 : 1) }];
    }).sort((a, b) => a.size - b.size);
    for (const q of visible) bat(q.x, q.y, q.size, time * 17 + q.b.phase,
      q.b.roll + Math.sin(q.p * 5 + q.b.phase) * .28, Math.min(1, q.p * 9));
    if (time > 7.1) {
      const t = Math.min(1, (time - 7.1) / .7), p = t * t * (3 - 2 * t);
      for (let i = 0; i < 9; i++) {
        const angle = i * Math.PI * 2 / 9;
        bat(width / 2 + Math.cos(angle) * width * .45 * (1 - p),
          height / 2 + Math.sin(angle) * height * .45 * (1 - p),
          Math.max(width, height) * (.12 + .85 * p), time * 12 + i, angle, 1);
      }
    }
  }
  resize();
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  return { draw, dispose: () => { observer.disconnect(); ctx?.clearRect(0, 0, width, height); } };
}
