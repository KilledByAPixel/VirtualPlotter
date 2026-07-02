'use strict';
// Pure pen-behavior simulation: turns ideal ink segments into draw ops with
// width/alpha/gaps according to the pen's type and remaining ink. No DOM or
// three.js so it runs under node --test; randomness comes from an injected
// seeded RNG so behavior is deterministic and testable.

// mulberry32 — tiny seeded RNG, plenty for line jitter.
export function createRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOW_INK = 0.15;      // below this fraction the line fades and skips
const REF_TIP = 0.5;       // capacityM is rated at this tip width

export class PenSim {
  constructor(pen, { ink = 1, rng = createRng(1) } = {}) {
    this.pen = pen;
    this.ink = ink;
    this.rng = rng;
    this.strokeMm = 0;     // mm drawn since the last pen-down
    this.drawnMm = 0;      // lifetime mm (drives brush width phase)
  }

  penDown() { this.strokeMm = 0; }
  penUp() {}
  refill() { this.ink = 1; }

  // One ideal segment in -> zero or one draw ops out.
  segment(ax, ay, bx, by) {
    const len = Math.hypot(bx - ax, by - ay);
    if (len <= 0 || this.ink <= 0) return [];
    const pen = this.pen;
    const startMm = this.strokeMm;
    this.strokeMm += len;
    this.drawnMm += len;
    const spend = (len / 1000 / pen.capacityM) * (pen.tip / REF_TIP);
    this.ink = Math.max(0, this.ink - spend);
    return [{ ax, ay, bx, by, widthMm: pen.tip, alpha: 1 }];
  }
}
