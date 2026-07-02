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

    // Dry start: cheap pens need a few mm to get flowing after pen-down.
    if (pen.dryStartMm && startMm < pen.dryStartMm) return [];

    // Random skips: base chance for cheap pens, rising sharply on low ink.
    let skip = pen.skipChance || 0;
    if (this.ink < LOW_INK) skip += 0.5 * (1 - this.ink / LOW_INK);
    if (skip > 0 && this.rng() < skip) return [];

    let width = pen.tip;
    if (pen.style === 'brush') {
      // Organic swell: two incommensurate sines over drawn distance.
      const t = this.drawnMm;
      const s = 0.5 + 0.5 * Math.sin(t * 0.09) * Math.sin(t * 0.023 + 2);
      width = pen.tipMin + (pen.tipMax - pen.tipMin) * s;
    } else if (pen.style === 'sharpie' && startMm < 1) {
      width = pen.tip * 1.4;   // touch-down blob
    }

    let alpha = 1;
    if (this.ink < LOW_INK) alpha *= Math.max(0.15, this.ink / LOW_INK);

    return [{ ax, ay, bx, by, widthMm: width, alpha }];
  }
}
