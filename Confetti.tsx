import { useEffect, useRef } from 'react';
import { reducedMotion } from '../../state/app';

/** Confettis plein écran sur canvas. `fireConfetti()` est appelable de partout. */
interface P { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; life: number }

let fireImpl: ((count: number, colors?: string[]) => void) | null = null;
export function fireConfetti(count = 140, colors?: string[]) { fireImpl?.(count, colors); }

const DEFAULT = ['#b154ff', '#ff3ea5', '#2ef2ff', '#3ee07a', '#ffd23f'];

export function ConfettiLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let parts: P[] = [];
    let raf = 0;
    const resize = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; };
    resize();
    addEventListener('resize', resize);
    const loop = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const d = devicePixelRatio;
      parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
      for (const p of parts) {
        p.vy += 0.18; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
        ctx.save();
        ctx.translate(p.x * d, p.y * d);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, p.life / 40);
        ctx.fillRect((-p.size / 2) * d, (-p.size / 4) * d, p.size * d, (p.size / 2) * d);
        ctx.restore();
      }
      raf = parts.length ? requestAnimationFrame(loop) : 0;
    };
    fireImpl = (count, colors = DEFAULT) => {
      if (reducedMotion()) count = Math.min(count, 30);
      for (let i = 0; i < count; i++) {
        const side = i % 2 ? 1 : -1;
        parts.push({
          x: innerWidth / 2 + side * innerWidth * 0.15 * Math.random(), y: innerHeight * 0.45,
          vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
          rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
          size: 6 + Math.random() * 8, color: colors[i % colors.length], life: 140 + Math.random() * 80,
        });
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };
    return () => { removeEventListener('resize', resize); cancelAnimationFrame(raf); fireImpl = null; };
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden />;
}
