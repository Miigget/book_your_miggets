export interface ShotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ShotPath {
  startX: number;
  startY: number;
  hitX: number;
  hitY: number;
}

export interface EdgeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const EPS = 1e-9;
const SPEED_PX_PER_S = 1700;
const FIRE_MS = 2600;
const FIRST_SHOT_MS = 800;
const MUZZLE_MS = 90;
const MIN_FLIGHT_PX = 32;
const TIP_PX = 16;
const SPIN_MS = 420;
const SPIN_EVERY_MS = 9000;
const FIRST_SPIN_MS = 4200;

/** First intersection of the segment (ox,oy)→(tx,ty) with rect’s boundary. Null if origin is inside or the segment misses. */
export function rayHitRect(
  ox: number,
  oy: number,
  tx: number,
  ty: number,
  rect: EdgeRect,
): { x: number; y: number } | null {
  if (ox >= rect.left && ox <= rect.right && oy >= rect.top && oy <= rect.bottom) {
    return null;
  }

  const dx = tx - ox;
  const dy = ty - oy;
  let tEnter = 0;
  let tExit = Number.POSITIVE_INFINITY;

  const slab = (origin: number, dir: number, min: number, max: number): boolean => {
    if (Math.abs(dir) < EPS) {
      return origin >= min && origin <= max;
    }
    let t1 = (min - origin) / dir;
    let t2 = (max - origin) / dir;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tEnter = Math.max(tEnter, t1);
    tExit = Math.min(tExit, t2);
    return tEnter <= tExit;
  };

  if (!slab(ox, dx, rect.left, rect.right)) return null;
  if (!slab(oy, dy, rect.top, rect.bottom)) return null;
  if (tEnter < 0 || !Number.isFinite(tEnter)) return null;

  return { x: ox + dx * tEnter, y: oy + dy * tEnter };
}

export function nearestPointOnRect(x: number, y: number, rect: EdgeRect): { x: number; y: number } {
  return {
    x: Math.max(rect.left, Math.min(rect.right, x)),
    y: Math.max(rect.top, Math.min(rect.bottom, y)),
  };
}

/** Local +X is the barrel. Screen-down is +Y, so 90° aims downward. */
export function aimDegToward(localX: number, localY: number): number {
  return (Math.atan2(localY, localX) * 180) / Math.PI;
}

/** One Teeworlds-style 360: ease-out from the current aim angle. */
export function spinDeg(fromDeg: number, progress: number): number {
  const u = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - u) ** 2;
  return fromDeg + 360 * eased;
}

function toEdgeRect(box: ShotRect): EdgeRect {
  return { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height };
}

/** Muzzle-center → nearest point on the button’s edge (left tee hits the facing side / corner). */
export function pistolShotToRect(muzzle: ShotRect, button: ShotRect): ShotPath | null {
  if (muzzle.width <= 0 || button.width <= 0) return null;

  const startX = muzzle.left + muzzle.width * 0.5;
  const startY = muzzle.top + muzzle.height * 0.5;
  const edge = toEdgeRect(button);
  if (startX >= edge.left && startX <= edge.right && startY >= edge.top && startY <= edge.bottom) {
    return null;
  }

  const hit = nearestPointOnRect(startX, startY, edge);
  if (Math.hypot(hit.x - startX, hit.y - startY) < MIN_FLIGHT_PX) return null;

  return { startX, startY, hitX: hit.x, hitY: hit.y };
}

interface FlyingBullet {
  el: HTMLElement;
  startX: number;
  startY: number;
  hitX: number;
  hitY: number;
  sparkX: number;
  sparkY: number;
  dist: number;
  started: number;
  angle: number;
}

function inViewport(rect: DOMRect, extra = 0): boolean {
  return (
    rect.bottom > -extra &&
    rect.top < window.innerHeight + extra &&
    rect.right > -extra &&
    rect.left < window.innerWidth + extra
  );
}

function spawnImpact(overlay: HTMLElement, x: number, y: number): void {
  const el = document.createElement("div");
  el.className = "gores-impact";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  overlay.appendChild(el);
  el.addEventListener("animationend", () => {
    el.remove();
  });
}

function stripWeaponSpins(root: ParentNode): void {
  root.querySelectorAll(".weapon-360 > animateTransform, .gores-pendulum").forEach((node) => {
    node.remove();
  });
}

function aimDegAtButton(shooter: SVGGraphicsElement, button: DOMRect): number | null {
  const actor = shooter.parentElement;
  if (!(actor instanceof SVGGraphicsElement)) return null;
  const ctm = actor.getScreenCTM();
  if (!ctm) return null;

  const origin = new DOMPoint(0, 0).matrixTransform(ctm);
  const hit = nearestPointOnRect(origin.x, origin.y, {
    left: button.left,
    top: button.top,
    right: button.right,
    bottom: button.bottom,
  });
  let inv: DOMMatrix;
  try {
    inv = ctm.inverse();
  } catch {
    return null;
  }
  const local = new DOMPoint(hit.x, hit.y).matrixTransform(inv);
  return aimDegToward(local.x, local.y);
}

export function startGoresShots(root: ParentNode = document): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduce.matches) {
    stripWeaponSpins(root);
    return function stopReducedMotionShots() {
      return;
    };
  }

  const overlay = root.querySelector("[data-gores-shots]");
  const muzzle = root.querySelector(".js-gores-muzzle");
  const shooter = root.querySelector(".js-gores-shooter");
  const target = document.querySelector("[data-gores-shot-target]");
  if (
    !(overlay instanceof HTMLElement) ||
    !(muzzle instanceof Element) ||
    !(shooter instanceof SVGGraphicsElement) ||
    !(target instanceof HTMLElement)
  ) {
    return function stopMissingShotNodes() {
      return;
    };
  }

  let stopped = false;
  let raf = 0;
  let spinFrom = 0;
  let spinStarted = Number.NEGATIVE_INFINITY;
  let nextSpinAt = performance.now() + FIRST_SPIN_MS;
  const bullets: FlyingBullet[] = [];

  const isSpinning = (now: number) => now < spinStarted + SPIN_MS;

  const updateAim = (now: number) => {
    const buttonBox = target.getBoundingClientRect();
    if (buttonBox.width <= 0 || !inViewport(buttonBox, 80)) {
      shooter.removeAttribute("transform");
      return;
    }
    const targetDeg = aimDegAtButton(shooter, buttonBox);
    if (targetDeg == null) return;

    if (!isSpinning(now) && now >= nextSpinAt) {
      spinFrom = targetDeg;
      spinStarted = now;
      nextSpinAt = now + SPIN_EVERY_MS;
    }

    const deg = isSpinning(now) ? spinDeg(spinFrom, (now - spinStarted) / SPIN_MS) : targetDeg;
    shooter.setAttribute("transform", `rotate(${deg})`);
  };

  const updateBullets = (now: number) => {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const bullet = bullets[i];
      const t = Math.min(1, ((now - bullet.started) / 1000) * (SPEED_PX_PER_S / bullet.dist));
      const x = bullet.startX + (bullet.hitX - bullet.startX) * t;
      const y = bullet.startY + (bullet.hitY - bullet.startY) * t;
      bullet.el.style.transform = `translate(${x}px, ${y}px) rotate(${bullet.angle}rad) translate(-50%, -50%)`;
      if (t >= 1) {
        spawnImpact(overlay, bullet.sparkX, bullet.sparkY);
        bullet.el.remove();
        bullets.splice(i, 1);
      }
    }
  };

  const loop = (now: number) => {
    raf = 0;
    updateAim(now);
    updateBullets(now);
    if (!stopped) raf = requestAnimationFrame(loop);
  };

  const fire = () => {
    if (stopped || isSpinning(performance.now())) return;
    const muzzleBox = muzzle.getBoundingClientRect();
    const buttonBox = target.getBoundingClientRect();
    if (!inViewport(muzzleBox) || !inViewport(buttonBox)) return;

    const path = pistolShotToRect(muzzleBox, buttonBox);
    if (!path) return;

    const dist = Math.hypot(path.hitX - path.startX, path.hitY - path.startY);
    const ux = (path.hitX - path.startX) / dist;
    const uy = (path.hitY - path.startY) / dist;
    const hitX = path.hitX - ux * TIP_PX;
    const hitY = path.hitY - uy * TIP_PX;
    const travel = Math.hypot(hitX - path.startX, hitY - path.startY);
    if (travel < MIN_FLIGHT_PX) return;

    muzzle.classList.add("is-pop");
    window.setTimeout(() => {
      muzzle.classList.remove("is-pop");
    }, MUZZLE_MS);

    const el = document.createElement("div");
    el.className = "gores-bullet";
    overlay.appendChild(el);

    bullets.push({
      el,
      startX: path.startX,
      startY: path.startY,
      hitX,
      hitY,
      sparkX: path.hitX,
      sparkY: path.hitY,
      dist: travel,
      started: performance.now(),
      angle: Math.atan2(path.hitY - path.startY, path.hitX - path.startX),
    });
  };

  raf = requestAnimationFrame(loop);
  const first = window.setTimeout(fire, FIRST_SHOT_MS);
  const interval = window.setInterval(fire, FIRE_MS);

  return () => {
    stopped = true;
    window.clearTimeout(first);
    window.clearInterval(interval);
    if (raf !== 0) cancelAnimationFrame(raf);
    shooter.removeAttribute("transform");
    for (const bullet of bullets) bullet.el.remove();
    bullets.length = 0;
  };
}
