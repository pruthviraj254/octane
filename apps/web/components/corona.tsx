"use client";

import { useEffect, useRef } from "react";

const DUSK = [138, 160, 204];
const SUNSET = [255, 107, 44];
const WHITE_HOT = [255, 214, 186];
const SHADES = 12;
const IGNITION_DELAY = 0.45;
const IGNITION_SECONDS = 1.6;
const SHOCK_SECONDS = 1.5;
const TAU = Math.PI * 2;
/** The canvas starts behind the header, so the glow fades out under it instead of being cut. */
const HEADER = 64;
const SIXTH = Math.PI / 3;
/** Below about 35 frames a second, the ring sheds dots rather than stutter. */
const SLOW_FRAME_SECONDS = 0.028;
const MIN_DOTS = 1200;

const mix = (from: number[], to: number[], amount: number) =>
  from.map((channel, index) => Math.round(channel + ((to[index] ?? 0) - channel) * amount));

/** Cool dusk up to sunset, then white at the very hottest. */
const PALETTE = Array.from({ length: SHADES }, (_, index) => {
  const heat = index / (SHADES - 1);
  const [r, g, b] = heat < 0.75 ? mix(DUSK, SUNSET, heat / 0.75) : mix(SUNSET, WHITE_HOT, (heat - 0.75) / 0.25);
  return `rgb(${r} ${g} ${b})`;
});

/** Distance from the centre to a pointy-top hexagon's edge, at this angle. */
function hexRadius(theta: number): number {
  const wrapped = ((theta + Math.PI / 2) % SIXTH + SIXTH) % SIXTH;
  return Math.cos(Math.PI / 6) / Math.cos(wrapped - Math.PI / 6);
}

function wrapAngle(angle: number): number {
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function gaussian(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random());
}

interface Layout {
  width: number;
  height: number;
  cx: number;
  cy: number;
  radius: number;
}

/** On a wide screen the ring frames the wallet panel. On a phone it frames the headline. */
function layoutFor(width: number, height: number): Layout {
  if (width >= 1024) {
    const panelCentre = width / 2 + Math.min(width, 1152) / 2 - 24 - 220;
    return { width, height, cx: panelCentre, cy: HEADER + 306, radius: 306 };
  }
  return { width, height, cx: width / 2, cy: HEADER + 158, radius: Math.min(width * 0.44, 176) };
}

/**
 * A hexagonal eclipse drawn in thousands of dots. It's the market made visible: each hot spot on
 * the rim is a live maker, the first is the best price, and `pulse` sends a shock through the
 * ring when a payment settles. It starts cool and ignites, then stays still for reduced motion.
 */
export function Corona({ makers, pulse }: { makers: number; pulse: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ makers, shockAt: -10, requested: pulse });
  live.current.makers = makers;

  useEffect(() => {
    if (pulse === live.current.requested) return;
    live.current.requested = pulse;
    live.current.shockAt = performance.now() / 1000;
  }, [pulse]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = window.innerWidth >= 1024 ? 7000 : 3000;
    let active = count;
    const theta = new Float32Array(count);
    const depth = new Float32Array(count);
    const speed = new Float32Array(count);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      theta[index] = Math.random() * TAU;
      // Most dots hug the rim. A few drift out as the corona's long tail, and fewer fall inside.
      const offset = Math.abs(gaussian()) * (Math.random() < 0.2 ? 0.3 : 0.05);
      depth[index] = Math.random() < 0.08 ? -Math.random() * 0.035 : offset;
      speed[index] = (0.018 + 0.05 / (1 + Math.abs(depth[index] ?? 0) * 9)) * (0.8 + Math.random() * 0.4);
      phase[index] = Math.random() * TAU;
      size[index] = Math.random() < 0.1 ? 2 : Math.random() < 0.45 ? 1.5 : 1.1;
    }

    const spots = Array.from({ length: 8 }, (_, index) => ({
      angle: -Math.PI / 2 + (index * TAU) / 5 + 0.3,
      speed: 0.05 + index * 0.012,
    }));

    let layout = layoutFor(1, 1);
    let scale = 1;
    const resize = () => {
      const box = element.getBoundingClientRect();
      scale = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(box.width * scale);
      element.height = Math.round(box.height * scale);
      layout = layoutFor(box.width, box.height);
    };

    const started = performance.now() / 1000;
    const buckets: number[][] = PALETTE.map(() => []);
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    const alphas = new Float32Array(count);

    const draw = (now: number, delta: number) => {
      const { width, height, cx, cy, radius } = layout;
      const time = now - started;
      const ignition = still ? 1 : Math.min(1, Math.max(0, (time - IGNITION_DELAY) / IGNITION_SECONDS));
      const warm = ignition * ignition * (3 - 2 * ignition);
      const lit = Math.max(live.current.makers, 0);
      const shockAge = now - live.current.shockAt;
      const shock = shockAge < SHOCK_SECONDS ? shockAge / SHOCK_SECONDS : -1;

      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);

      // A broad glow behind the hottest part of the rim.
      const leader = spots[0];
      if (lit > 0 && leader) {
        const angle = leader.angle;
        const glowRadius = hexRadius(angle) * radius;
        const gx = cx + Math.cos(angle) * glowRadius;
        const gy = cy + Math.sin(angle) * glowRadius;
        const glow = context.createRadialGradient(gx, gy, 0, gx, gy, radius * 1.1);
        const strength = 0.2 * warm + (shock >= 0 ? 0.3 * (1 - shock) : 0);
        glow.addColorStop(0, `rgb(255 107 44 / ${strength})`);
        glow.addColorStop(1, "rgb(255 107 44 / 0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);
      }

      // The hexagon's edge, lit from the leading maker around to nothing on the far side.
      if (leader) {
        const rim = context.createConicGradient(leader.angle, cx, cy);
        rim.addColorStop(0, `rgb(255 150 96 / ${0.15 + 0.75 * warm})`);
        rim.addColorStop(0.16, "rgb(170 190 225 / 0.22)");
        rim.addColorStop(0.5, "rgb(170 190 225 / 0.1)");
        rim.addColorStop(0.84, "rgb(170 190 225 / 0.22)");
        rim.addColorStop(1, `rgb(255 150 96 / ${0.15 + 0.75 * warm})`);
        context.beginPath();
        for (let corner = 0; corner < 6; corner += 1) {
          const angle = -Math.PI / 2 + corner * SIXTH;
          context.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        }
        context.closePath();
        context.strokeStyle = rim;
        context.lineWidth = 1.25;
        context.lineJoin = "round";
        context.stroke();
      }

      for (const bucket of buckets) bucket.length = 0;

      for (let index = 0; index < active; index += 1) {
        const offset = depth[index] ?? 0;
        const angle = (theta[index] ?? 0) + (speed[index] ?? 0) * delta;
        theta[index] = angle;
        const wave = Math.sin(angle * 3 + time * 0.35 + (phase[index] ?? 0)) * 0.012;
        let distance = hexRadius(angle) + offset + wave;

        let heat = 0;
        for (let spot = 0; spot < Math.min(lit, spots.length); spot += 1) {
          const gap = wrapAngle(angle - (spots[spot]?.angle ?? 0));
          const reach = spot === 0 ? 0.11 : 0.035;
          heat += (spot === 0 ? 1.15 : 0.7) * Math.exp(-(gap * gap) / reach);
        }
        heat *= Math.exp(-Math.abs(offset) / 0.22) * warm;

        if (shock >= 0) {
          const front = 0.92 + shock * 0.75;
          const gap = (distance - front) / 0.07;
          const hit = Math.exp(-gap * gap) * (1 - shock);
          distance += hit * 0.05;
          heat += hit * 1.2;
        }

        const twinkle = 0.62 + 0.38 * Math.sin(time * 1.4 + (phase[index] ?? 0));
        const fade = Math.exp(-Math.abs(offset) / 0.16);
        xs[index] = cx + Math.cos(angle) * distance * radius;
        ys[index] = cy + Math.sin(angle) * distance * radius;
        alphas[index] = Math.min(1, (0.2 + 0.8 * fade) * twinkle + heat * 0.4);
        buckets[Math.min(SHADES - 1, Math.floor(Math.min(heat, 1) * SHADES))]?.push(index);
      }

      buckets.forEach((bucket, shade) => {
        context.fillStyle = PALETTE[shade] ?? "white";
        for (const index of bucket) {
          const dot = size[index] ?? 1;
          context.globalAlpha = alphas[index] ?? 0;
          context.fillRect(xs[index] ?? 0, ys[index] ?? 0, dot, dot);
        }
      });
      context.globalAlpha = 1;

      for (const [index, spot] of spots.entries()) {
        spot.angle += spot.speed * delta * (index % 2 === 0 ? 1 : 0.7);
      }
    };

    let frame = 0;
    let last = performance.now() / 1000;
    let visible = true;
    let pace = 1 / 60;
    let settled = 0;
    const loop = () => {
      const now = performance.now() / 1000;
      const elapsed = now - last;
      draw(now, Math.min(elapsed, 0.05));
      last = now;
      pace += (Math.min(elapsed, 0.2) - pace) * 0.05;
      settled += 1;
      if (settled > 90 && pace > SLOW_FRAME_SECONDS && active > MIN_DOTS) {
        active = Math.max(MIN_DOTS, Math.floor(active * 0.75));
        settled = 0;
      }
      if (visible && !document.hidden) frame = requestAnimationFrame(loop);
      else frame = 0;
    };
    const resume = () => {
      if (still || frame !== 0 || !visible || document.hidden) return;
      last = performance.now() / 1000;
      frame = requestAnimationFrame(loop);
    };

    const sizeObserver = new ResizeObserver(() => {
      resize();
      if (still) draw(started + 10, 0);
    });
    sizeObserver.observe(element);
    const viewObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      resume();
    });
    viewObserver.observe(element);
    document.addEventListener("visibilitychange", resume);

    resize();
    if (still) draw(started + 10, 0);
    else resume();

    return () => {
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-16 h-[460px] w-full [mask-image:linear-gradient(to_bottom,transparent,black_64px,black_78%,transparent)] lg:h-[860px]"
    />
  );
}
