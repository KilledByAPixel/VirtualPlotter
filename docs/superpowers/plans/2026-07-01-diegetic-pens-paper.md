# Diegetic Pens & Paper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace abstract pen/paper settings with clickable 3D objects — a caddy of real-style pens with finite, persistent ink and per-type line character, and a paper stack that changes the plotting surface.

**Architecture:** A new pure-logic module `code/penSim.js` sits between `PlotSim.onInk` and the canvas, converting ideal segments into draw ops (width/alpha/gaps) per pen type and ink level; it is unit-tested under `node --test` with a seeded RNG. `code/inventory.js` holds data-only pen/paper definitions. `code/scene.js` gains a draw-op renderer, paper surfaces, caddy/stack meshes with raycast picking, and a pen-swap animation. `index.html` owns state: layer→pen assignments, persistence, and the panel UI (pen chips, override color pickers).

**Tech Stack:** Plain ES modules, three.js 0.160 (CDN import map), 2D canvas ink texture, `node --test` (zero deps). No build step.

**Spec:** `docs/superpowers/specs/2026-07-01-diegetic-pens-paper-design.md`

## Global Constraints

- No new dependencies, no build step; everything runs by static-serving the repo.
- `code/penSim.js` and `code/inventory.js` must not touch DOM or three.js (they run under node).
- All randomness in penSim comes from an injected seeded RNG (`createRng`), never `Math.random` (scene-side visual jitter may use `Math.random`).
- localStorage access always wrapped in try/catch (existing pattern); failure ⇒ in-memory defaults.
- Persistence keys: `plotter3d.pens`, `plotter3d.paper`.
- Pen/paper interaction locked while a plot is running (same rule as today's swatch lock).
- The `Pen` thickness `<select>` (added 2026-07-01) is removed; thickness becomes a pen property.
- Existing behavior preserved: sample seeding, recents, mute, speed gate on audio, F/H keys.

---

### Task 1: Pen & paper inventory (data module)

**Files:**
- Create: `code/inventory.js`
- Test: `code/inventory.test.js`

**Interfaces:**
- Produces: `PENS` (array of pen defs), `PAPERS` (array of paper defs), `DEFAULT_PEN`, `DEFAULT_PAPER` (id strings).
- Pen def shape: `{ id, name, style, tip, color, capacityM, opaque?, sheen?, tipMin?, tipMax?, dryStartMm?, skipChance? }`.
- Paper def shape: `{ id, name, color, grain, bleed }` (grain/bleed are 0 when absent).

- [ ] **Step 1: Write the failing test**

```js
// code/inventory.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PENS, PAPERS, DEFAULT_PEN, DEFAULT_PAPER } from './inventory.js';

test('pen definitions are unique and complete', () => {
  const ids = new Set();
  for (const p of PENS) {
    assert.ok(!ids.has(p.id), `duplicate pen id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.name && p.style, `${p.id} missing name/style`);
    assert.ok(p.tip > 0, `${p.id} bad tip`);
    assert.ok(p.capacityM > 0, `${p.id} bad capacity`);
    assert.match(p.color, /^#[0-9a-f]{6}$/i, `${p.id} bad color`);
    if (p.style === 'brush')
      assert.ok(p.tipMin > 0 && p.tipMax > p.tipMin, 'brush needs tipMin/tipMax');
  }
  assert.ok(PENS.some(p => p.id === DEFAULT_PEN), 'DEFAULT_PEN exists');
});

test('paper definitions are unique and complete', () => {
  const ids = new Set();
  for (const p of PAPERS) {
    assert.ok(!ids.has(p.id), `duplicate paper id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.name, `${p.id} missing name`);
    assert.match(p.color, /^#[0-9a-f]{6}$/i, `${p.id} bad color`);
  }
  assert.ok(PAPERS.some(p => p.id === DEFAULT_PAPER), 'DEFAULT_PAPER exists');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test code/inventory.test.js`
Expected: FAIL — cannot find module `./inventory.js`.

- [ ] **Step 3: Write the inventory**

```js
// code/inventory.js
'use strict';
// Data-only definitions of the pens in the caddy and the papers in the stack.
// capacityM is meters of line a fresh pen can draw (penSim scales spend by tip
// width). No logic here — penSim interprets the behavior fields.

export const PENS = [
  { id: 'fine03',  name: 'Fineliner 0.3',      style: 'fineliner', tip: 0.3, color: '#1a1a1a', capacityM: 150 },
  { id: 'fine05',  name: 'Fineliner 0.5',      style: 'fineliner', tip: 0.5, color: '#1a1a1a', capacityM: 150 },
  { id: 'fine05r', name: 'Fineliner 0.5 red',  style: 'fineliner', tip: 0.5, color: '#c22d2d', capacityM: 150 },
  { id: 'fine05b', name: 'Fineliner 0.5 blue', style: 'fineliner', tip: 0.5, color: '#2b4fc2', capacityM: 150 },
  { id: 'sharpie', name: 'Sharpie',            style: 'sharpie',   tip: 2.0, color: '#111111', capacityM: 400 },
  { id: 'gel',     name: 'Gel white',          style: 'gel',       tip: 0.7, color: '#f2f2f2', capacityM: 120, opaque: true },
  { id: 'silver',  name: 'Metallic silver',    style: 'metallic',  tip: 1.0, color: '#b8bcc4', capacityM: 100, opaque: true, sheen: true },
  { id: 'gold',    name: 'Metallic gold',      style: 'metallic',  tip: 1.0, color: '#c9a83c', capacityM: 100, opaque: true, sheen: true },
  { id: 'brush',   name: 'Brush pen',          style: 'brush',     tip: 1.2, tipMin: 0.5, tipMax: 2.5, color: '#1a1a1a', capacityM: 250 },
  { id: 'ball',    name: 'Ballpoint',          style: 'ballpoint', tip: 0.5, color: '#20336e', capacityM: 500, dryStartMm: 3, skipChance: 0.03 },
];
export const DEFAULT_PEN = 'fine05';

export const PAPERS = [
  { id: 'bristol',    name: 'Bristol',    color: '#ffffff', grain: 0,    bleed: 0 },
  { id: 'watercolor', name: 'Watercolor', color: '#f6f1e4', grain: 0.5,  bleed: 0 },
  { id: 'cheap',      name: 'Cheap copy', color: '#f0f0ea', grain: 0.15, bleed: 0.5 },
  { id: 'black',      name: 'Black card', color: '#181a1c', grain: 0,    bleed: 0 },
];
export const DEFAULT_PAPER = 'bristol';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test code/inventory.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add code/inventory.js code/inventory.test.js
git commit -m "feat: add pen and paper inventory definitions"
```

---

### Task 2: penSim core — draw ops, depletion, refill

**Files:**
- Create: `code/penSim.js`
- Test: `code/penSim.test.js`

**Interfaces:**
- Consumes: pen defs from `code/inventory.js`.
- Produces: `createRng(seed) -> () => number` (deterministic, [0,1)); `class PenSim` with `constructor(penDef, {ink=1, rng=createRng(1)}={})`, `.ink` (number 0..1, readable), `.penDown()`, `.penUp()`, `.refill()`, `.segment(ax,ay,bx,by) -> [{ax,ay,bx,by,widthMm,alpha}]` (0 or 1 ops).

- [ ] **Step 1: Write the failing tests**

```js
// code/penSim.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PenSim, createRng } from './penSim.js';
import { PENS } from './inventory.js';

const pen = (id) => PENS.find(p => p.id === id);

test('createRng is deterministic per seed', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, [c(), c(), c()]);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('fineliner passes a segment through at tip width, full alpha', () => {
  const ps = new PenSim(pen('fine05'));
  ps.penDown();
  const ops = ps.segment(0, 0, 10, 0);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].widthMm, 0.5);
  assert.equal(ops[0].alpha, 1);
  assert.deepEqual([ops[0].ax, ops[0].ay, ops[0].bx, ops[0].by], [0, 0, 10, 0]);
});

test('ink depletes with drawn length, scaled by tip width', () => {
  const ps = new PenSim(pen('fine05'));       // capacityM 150, tip 0.5
  ps.penDown();
  ps.segment(0, 0, 1000, 0);                  // 1 m of line
  assert.ok(Math.abs(ps.ink - (1 - 1 / 150)) < 1e-9);

  const fat = new PenSim(pen('sharpie'));     // tip 2.0 drinks 4x faster per mm
  fat.penDown();
  fat.segment(0, 0, 1000, 0);
  assert.ok(Math.abs(fat.ink - (1 - (1 / 400) * (2.0 / 0.5))) < 1e-9);
});

test('zero-length segments draw nothing and spend nothing', () => {
  const ps = new PenSim(pen('fine05'));
  ps.penDown();
  assert.equal(ps.segment(5, 5, 5, 5).length, 0);
  assert.equal(ps.ink, 1);
});

test('empty pen draws nothing; refill restores it', () => {
  const ps = new PenSim(pen('fine05'), { ink: 0 });
  ps.penDown();
  assert.equal(ps.segment(0, 0, 10, 0).length, 0);
  ps.refill();
  assert.equal(ps.ink, 1);
  assert.equal(ps.segment(0, 0, 10, 0).length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test code/penSim.test.js`
Expected: FAIL — cannot find module `./penSim.js`.

- [ ] **Step 3: Write the core implementation**

```js
// code/penSim.js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test code/penSim.test.js`
Expected: PASS (5 tests). (`startMm` is unused until Task 3 — that's expected.)

- [ ] **Step 5: Commit**

```bash
git add code/penSim.js code/penSim.test.js
git commit -m "feat: add penSim core with ink depletion and refill"
```

---

### Task 3: penSim line character — fade, skips, dry start, blob, brush

**Files:**
- Modify: `code/penSim.js` (the `segment` method)
- Test: `code/penSim.test.js` (append)

**Interfaces:**
- Consumes/Produces: same `segment()` signature as Task 2; ops may now be dropped (gaps) and carry varying `widthMm`/`alpha`.

- [ ] **Step 1: Write the failing tests (append to penSim.test.js)**

```js
test('low ink fades the line and produces skips', () => {
  const ps = new PenSim(pen('fine05'), { ink: 0.05, rng: createRng(7) });
  ps.penDown();
  let drawn = 0, skipped = 0, minAlpha = 1;
  for (let x = 0; x < 400; x += 4) {
    const ops = ps.segment(x, 0, x + 4, 0);
    if (ops.length) { drawn++; minAlpha = Math.min(minAlpha, ops[0].alpha); }
    else skipped++;
  }
  assert.ok(drawn > 0, 'still marks sometimes');
  assert.ok(skipped > 0, 'skips sometimes');
  assert.ok(minAlpha < 0.6, 'line visibly fades');
});

test('healthy fineliner never skips', () => {
  const ps = new PenSim(pen('fine05'), { rng: createRng(3) });
  ps.penDown();
  for (let x = 0; x < 200; x += 4)
    assert.equal(ps.segment(x, 0, x + 4, 0).length, 1);
});

test('ballpoint dry-starts after every pen-down', () => {
  const ps = new PenSim(pen('ball'), { rng: () => 0.99 });  // never random-skip
  ps.penDown();
  assert.equal(ps.segment(0, 0, 2, 0).length, 0);   // 0-2mm  < dryStartMm 3
  assert.equal(ps.segment(2, 0, 4, 0).length, 0);   // starts at 2mm, still dry
  assert.equal(ps.segment(4, 0, 8, 0).length, 1);   // starts at 4mm, flowing
  ps.penDown();                                     // new stroke: dry again
  assert.equal(ps.segment(0, 0, 1, 0).length, 0);
});

test('sharpie blobs at the touch-down', () => {
  const ps = new PenSim(pen('sharpie'));
  ps.penDown();
  const first = ps.segment(0, 0, 1, 0)[0];
  const later = ps.segment(1, 0, 30, 0)[0];
  assert.ok(first.widthMm > later.widthMm, 'first mm is fatter');
  assert.equal(later.widthMm, 2.0);
});

test('brush width varies smoothly within [tipMin, tipMax]', () => {
  const ps = new PenSim(pen('brush'));
  ps.penDown();
  const widths = [];
  for (let x = 0; x < 300; x += 5) widths.push(ps.segment(x, 0, x + 5, 0)[0].widthMm);
  assert.ok(Math.min(...widths) >= 0.5 - 1e-9);
  assert.ok(Math.max(...widths) <= 2.5 + 1e-9);
  assert.ok(new Set(widths.map(w => w.toFixed(3))).size > 3, 'width actually varies');
  for (let i = 1; i < widths.length; i++)
    assert.ok(Math.abs(widths[i] - widths[i - 1]) < 0.6, 'no sudden jumps');
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test code/penSim.test.js`
Expected: 5 pass (Task 2), the 5 new ones FAIL.

- [ ] **Step 3: Extend `segment()`**

Replace the `return [...]` tail of `segment()` (everything after the `spend` bookkeeping) with:

```js
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
    } else if (pen.style === 'sharpie' && startMm < 1.5) {
      width = pen.tip * 1.4;   // touch-down blob
    }

    let alpha = 1;
    if (this.ink < LOW_INK) alpha *= Math.max(0.15, this.ink / LOW_INK);

    return [{ ax, ay, bx, by, widthMm: width, alpha }];
```

- [ ] **Step 4: Run all tests**

Run: `node --test`
Expected: PASS — inventory (2), penSim (10), sim (7).

- [ ] **Step 5: Commit**

```bash
git add code/penSim.js code/penSim.test.js
git commit -m "feat: pen line character - fade, skips, dry start, blob, brush width"
```

---

### Task 4: scene draw-op renderer + paper surfaces

**Files:**
- Modify: `code/scene.js` (ink canvas section: `clearInk`, `inkSegment`, exports)

**Interfaces:**
- Consumes: nothing new.
- Produces: `scene.drawOp({ax,ay,bx,by,color,widthMm,alpha?,sheen?})` and `scene.setPaper({color,grain,bleed})`, both exported from `createScene`. `inkSegment` and `setPenWidth` remain temporarily (removed in Task 5) so the app keeps working between commits.

- [ ] **Step 1: Add paper state and rewrite the ink functions**

In `code/scene.js`, replace the `clearInk` definition with:

```js
  let paper = { color: '#ffffff', grain: 0, bleed: 0 };
  const clearInk = () => {
    ctx.globalAlpha = 1;
    ctx.fillStyle = paper.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
```

After `resetInk` (near `setPenColor`), add:

```js
  function setPaper(p) {
    paper = { color: p.color || '#ffffff', grain: p.grain || 0, bleed: p.bleed || 0 };
    slab.material.color.set(paper.color);  // paper edges match the sheet
    clearInk();
    tex.needsUpdate = true;
  }
```

Replace the body of `inkSegment` and add `drawOp` beside it:

```js
  // Paper-aware stroke renderer. grain roughens alpha per op (visual only, so
  // Math.random is fine here); bleed adds a faint wide halo pass; sheen adds a
  // bright core fleck so metallic ink glints.
  function drawOp(op) {
    const { ax, ay, bx, by, color, widthMm, alpha = 1, sheen } = op;
    let a = alpha;
    if (paper.grain) a *= 1 - paper.grain * 0.7 * Math.random();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color || '#000';
    const seg = () => {
      ctx.beginPath();
      ctx.moveTo(cX(ax), cY(ay));
      ctx.lineTo(cX(bx), cY(by));
      ctx.stroke();
    };
    if (paper.bleed) {
      ctx.globalAlpha = a * 0.25;
      ctx.lineWidth = Math.max(1, (widthMm + paper.bleed) * PXMM);
      seg();
    }
    ctx.globalAlpha = a;
    ctx.lineWidth = Math.max(1, widthMm * PXMM);
    seg();
    if (sheen) {
      ctx.globalAlpha = a * 0.3 * Math.random();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, widthMm * 0.35 * PXMM);
      seg();
    }
    ctx.globalAlpha = 1;
    tex.needsUpdate = true;
  }

  // Legacy shim (callers move to drawOp in the next task).
  function inkSegment(ax, ay, bx, by, color) {
    drawOp({ ax, ay, bx, by, color, widthMm: penWidthMm });
  }
```

Add `drawOp, setPaper,` to the returned object (keep `inkSegment`, `setPenWidth` for now).

- [ ] **Step 2: Parse-check and test**

Run: `node --check code/scene.js` then `node --test`
Expected: clean parse; 19 tests pass.

- [ ] **Step 3: Manual smoke test**

Run: `npx serve` → open the URL, plot the sample at 100×.
Expected: identical behavior to before (white paper, 0.6 mm lines, colors work).

- [ ] **Step 4: Commit**

```bash
git add code/scene.js
git commit -m "feat: paper-aware draw-op ink renderer in scene"
```

---

### Task 5: wire penSim into the app (state, assignment, persistence)

**Files:**
- Modify: `index.html` (imports, state, sim callbacks, `loadSvgText`, remove Pen select), `code/scene.js` (drop `inkSegment`/`setPenWidth` shim)

**Interfaces:**
- Consumes: `PENS/PAPERS/DEFAULT_PEN/DEFAULT_PAPER`, `PenSim`, `createRng`, `scene.drawOp`, `scene.setPaper`, `sim.onLayer`.
- Produces (used by Tasks 6–8): `penDef(id)`, `penColor(id)`, `penSimFor(id) -> PenSim`, `syncPen(id)`, `layerPens` (array: pen id per layer), `assignPen(layerIdx, penId)`, `paperSel` (`{id, color}`), `applyPaper()`, `plotLocked()` (true while running).

- [ ] **Step 1: Replace the Pen-thickness select with pen/paper state**

In `index.html` remove: the `Pen` `<label>`/`<select id=penSel>` block, `const penSel = ...`, the `penSel` persistence/change block, and `penSel.disabled` in `setSwatchesEnabled`. Add to the imports:

```js
import { PENS, PAPERS, DEFAULT_PEN, DEFAULT_PAPER } from './code/inventory.js';
import { PenSim, createRng } from './code/penSim.js';
```

After the `audio` setup, add the state layer:

```js
// --- pens & paper ---------------------------------------------------------
// Pen ink levels (and ink-color overrides) persist across sessions: your
// half-dead Sharpie is still half-dead tomorrow. PenSim instances are the
// live source of truth; penState mirrors them for storage.
const PEN_KEY = 'plotter3d.pens';
const PAPER_KEY = 'plotter3d.paper';
const penDef = (id) => PENS.find(p => p.id === id) || PENS[0];

let penState = {};
try { penState = JSON.parse(localStorage.getItem(PEN_KEY)) || {}; } catch {}
for (const p of PENS) penState[p.id] = { ink: 1, ...penState[p.id] };
function persistPens() {
  try { localStorage.setItem(PEN_KEY, JSON.stringify(penState)); } catch {}
}
const penColor = (id) => penState[id].color || penDef(id).color;

const penSims = {};
function penSimFor(id) {
  if (!penSims[id]) penSims[id] = new PenSim(penDef(id),
    { ink: penState[id].ink, rng: createRng(1234) });
  return penSims[id];
}
function syncPen(id) {
  if (!penSims[id]) return;
  penState[id].ink = penSims[id].ink;
  persistPens();
}

let paperSel = { id: DEFAULT_PAPER, color: null };
try { paperSel = { ...paperSel, ...(JSON.parse(localStorage.getItem(PAPER_KEY)) || {}) }; } catch {}
const paperDef = () => PAPERS.find(p => p.id === paperSel.id) || PAPERS[0];
function applyPaper() {
  const d = paperDef();
  scene.setPaper({ color: paperSel.color || d.color, grain: d.grain, bleed: d.bleed });
  try { localStorage.setItem(PAPER_KEY, JSON.stringify(paperSel)); } catch {}
}
applyPaper();

// Initial layer assignment: the pen whose ink is nearest the SVG layer color,
// so a red Inkscape layer picks up the red fineliner automatically.
function closestPen(hex) {
  const v = parseInt((hex || '#000000').slice(1), 16);
  const r = v >> 16 & 255, g = v >> 8 & 255, b = v & 255;
  let best = DEFAULT_PEN, bd = Infinity;
  for (const p of PENS) {
    const w = parseInt(penColor(p.id).slice(1), 16);
    const d = (r - (w >> 16 & 255)) ** 2 + (g - (w >> 8 & 255)) ** 2 + (b - (w & 255)) ** 2;
    if (d < bd) { bd = d; best = p.id; }
  }
  return best;
}

let layerPens = [];          // pen id per layer index
let activePenId = null;      // pen currently in the machine
const plotLocked = () => sim.running;

function assignPen(layerIdx, penId) {
  if (plotLocked()) return;
  layerPens[layerIdx] = penId;
  sim.layerInfo[layerIdx].color = penColor(penId);  // sim's color follows the pen
  buildLayerUI._refresh?.();
}
```

- [ ] **Step 2: Route sim callbacks through penSim**

Replace the existing `sim.onInk` line and extend `sim.onPose` / `sim.onComplete`:

```js
sim.onLayer = (i) => {
  const id = layerPens[i] ?? DEFAULT_PEN;
  if (id !== activePenId) {
    if (activePenId) syncPen(activePenId);
    activePenId = id;
    scene.setPenColor(penColor(id));   // replaced by real pen swap in Task 8
  }
};
sim.onInk = (ax, ay, bx, by) => {
  const id = activePenId ?? DEFAULT_PEN;
  const def = penDef(id);
  for (const op of penSimFor(id).segment(ax, ay, bx, by))
    scene.drawOp({ ...op, color: penColor(id), sheen: def.sheen });
};
sim.onComplete = () => {
  playBtn.textContent = '▶ Plot';
  setSwatchesEnabled(true);
  if (activePenId) syncPen(activePenId);
};
```

In the existing `sim.onPose` handler, inside the `if (down !== penDownPrev)` branch, add before the audio call:

```js
    const ps = activePenId && penSimFor(activePenId);
    if (ps) down ? ps.penDown() : ps.penUp();
```

In `loadSvgText`, after `sim.load(...)`, add:

```js
  layerPens = data.layerInfo.map(l => closestPen(l.color));
  data.layerInfo.forEach((l, i) => { l.color = penColor(layerPens[i]); });
  activePenId = null;
```

Also sync ink when pausing (inside the play/pause click handler's pause branch): `if (activePenId) syncPen(activePenId);`

- [ ] **Step 3: Remove the scene shim**

In `code/scene.js` delete `inkSegment`, `setPenWidth`, and the `penWidthMm` variable; remove both from the returned object. In `index.html` the `sim.onInk` no longer calls `scene.inkSegment` (done in Step 2) — verify no references remain: `git grep -n "inkSegment\|setPenWidth"` should return nothing.

- [ ] **Step 4: Verify**

Run: `node --check code/scene.js`, extract+check the inline script, `node --test` (19 pass). Then `npx serve`: plot the sample — black layer plots near-black fineliner, red layer auto-picks the red fineliner; plot repeatedly at 1000× and watch ink deplete (persists across reload).

- [ ] **Step 5: Commit**

```bash
git add index.html code/scene.js
git commit -m "feat: wire penSim into plotting with persistent ink and auto pen assignment"
```

---

### Task 6: panel rework — pen chips, override pickers

**Files:**
- Modify: `index.html` (CSS, `#controls` markup, `buildLayerUI`, `setSwatchesEnabled`)

**Interfaces:**
- Consumes: `assignPen`, `penColor`, `penDef`, `penSimFor`, `syncPen`, `paperSel`, `applyPaper`, `plotLocked`, `layerPens`.
- Produces (used by Task 7): `selectLayer(i)`, `selectPen(id)` (shows the pen info row; Task 7 calls these from scene picks), `refreshPanel()`.

- [ ] **Step 1: Markup + CSS**

Replace the `#layers` div in the HTML with:

```html
    <div id=layers></div>
    <div class=row id=penInfo style="display:none">
      <span id=penInfoDot class=dot></span>
      <span id=penInfoName class=layer-name></span>
      <span id=penInfoInk style="color:#888"></span>
      <input type=color id=penInkColor title="Override ink color">
      <button id=penReplace title="Swap in a fresh pen">Fresh</button>
    </div>
    <div class=row>
      <label>Paper <span id=paperName></span>
        <input type=color id=paperColor title="Override paper color">
      </label>
    </div>
```

Add CSS (near `.layer-row` rules):

```css
.layer-row { cursor: pointer; border-radius: 4px; padding: 1px 3px; }
.layer-row.sel { background: #e3ecf7; }
.dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; border: 1px solid #0002; }
.pen-name { color: #555; font-size: 11px; margin-left: auto; white-space: nowrap; }
#penInfo input[type=color], #paperColor { width: 18px; height: 18px; padding: 0; border: 1px solid #ccc; background: none; cursor: pointer; }
```

- [ ] **Step 2: Rewrite `buildLayerUI` and the lock helper**

Replace `buildLayerUI` and `setSwatchesEnabled` with:

```js
let selectedLayer = 0;
let selectedPenId = null;
const penInfo = document.getElementById('penInfo');
const paperColor = document.getElementById('paperColor');
const paperName = document.getElementById('paperName');

function setSwatchesEnabled(on) {   // name kept: same lock, wider scope
  document.getElementById('penInkColor').disabled = !on;
  document.getElementById('penReplace').disabled = !on;
  paperColor.disabled = !on;
}

function selectLayer(i) {
  selectedLayer = i;
  refreshPanel();
}

function selectPen(id) {
  selectedPenId = id;
  if (selectedLayer != null && !plotLocked()) assignPen(selectedLayer, id);
  refreshPanel();
}

function refreshPanel() {
  layersDiv.querySelectorAll('.layer-row').forEach((row, i) => {
    row.classList.toggle('sel', i === selectedLayer);
    row.querySelector('.dot').style.background = penColor(layerPens[i]);
    row.querySelector('.pen-name').textContent = penDef(layerPens[i]).name;
  });
  if (selectedPenId) {
    penInfo.style.display = '';
    document.getElementById('penInfoDot').style.background = penColor(selectedPenId);
    document.getElementById('penInfoName').textContent = penDef(selectedPenId).name;
    document.getElementById('penInfoInk').textContent =
      Math.round(penSimFor(selectedPenId).ink * 100) + '%';
    document.getElementById('penInkColor').value = penColor(selectedPenId);
  } else penInfo.style.display = 'none';
  paperName.textContent = paperDef().name;
  paperColor.value = paperSel.color || paperDef().color;
}
buildLayerUI._refresh = refreshPanel;

function buildLayerUI(data) {
  layerSel.innerHTML = '<option value=all>All layers</option>';
  layersDiv.innerHTML = '';
  data.layerInfo.forEach((l, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = l.name;
    layerSel.appendChild(opt);

    const row = document.createElement('div');
    row.className = 'layer-row';
    row.innerHTML = `<span class=dot></span><span class=layer-name></span><span class=pen-name></span>`;
    row.querySelector('.layer-name').textContent = l.name;
    row.addEventListener('click', () => selectLayer(i));
    layersDiv.appendChild(row);
  });
  layerSel.disabled = data.layerInfo.length < 2;
  selectedLayer = 0;
  refreshPanel();
}

document.getElementById('penInkColor').addEventListener('input', (e) => {
  if (!selectedPenId) return;
  penState[selectedPenId].color = e.target.value;
  persistPens();
  layerPens.forEach((id, i) => {      // layers holding this pen follow it
    if (id === selectedPenId) sim.layerInfo[i].color = penColor(id);
  });
  refreshPanel();
});
document.getElementById('penReplace').addEventListener('click', () => {
  if (!selectedPenId || plotLocked()) return;
  penSimFor(selectedPenId).refill();
  syncPen(selectedPenId);
  refreshPanel();
});
paperColor.addEventListener('input', (e) => {
  if (plotLocked()) return;
  paperSel.color = e.target.value;
  applyPaper();
});
```

Note: `sim.layerInfo` is the same array object as `data.layerInfo` passed to `sim.load` — mutating entries is the existing pattern (the old swatches did the same).

- [ ] **Step 3: Verify**

Extract+parse-check inline script; `node --test`; `npx serve`: click layer rows (highlight), no pen picking yet, but the layer chips show auto-assigned pens; override a pen's ink color and see the chip + plot color change; Fresh button refills; paper color override tints the sheet.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: panel pen chips, ink/paper override pickers, fresh-pen refill"
```

---

### Task 7: caddy + paper stack in the scene, picking, tooltip

**Files:**
- Modify: `code/scene.js` (meshes, raycasting, exports), `index.html` (build call, pick/hover wiring, tooltip div)

**Interfaces:**
- Consumes: pen/paper defs passed in from index (scene stays data-agnostic).
- Produces: `scene.buildInventory(pens, papers)`, `scene.onPick(fn)` (fn gets `{type:'pen'|'paper', id}`), `scene.onHover(fn)` (same payload or `null`), `scene.setPenLevel(id, frac)` (ink gauge), `scene.setPaperSelected(id)`, `scene.setPenInCaddy(id, visible)`.

- [ ] **Step 1: Build the caddy and stack meshes (scene.js, after the machine section)**

```js
  // --- pen caddy + paper stack (the diegetic settings) ---
  const pickables = [];            // meshes with .userData = {type, id}
  const penGroups = {};            // id -> {group, barrel, inkBar, homeY}
  const paperSheets = {};          // id -> mesh
  let selectedPaperId = null;

  function buildInventory(pens, papers) {
    const caddy = new THREE.Group();
    caddy.position.set(PAPER_W / 2 + 115, 0, 30);
    scene.add(caddy);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(100, 14, 90), matMatte('#5d4a38'));
    tray.position.y = 7;
    tray.castShadow = tray.receiveShadow = true;
    caddy.add(tray);

    pens.forEach((pen, i) => {
      const col = i % 5, row = (i / 5) | 0;
      const g = new THREE.Group();
      g.position.set(-40 + col * 20, 14, -20 + row * 40);
      const r = pen.style === 'sharpie' ? 4.5 : pen.style === 'brush' ? 3.2 : 2.4;
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 0.8, 38, 14),
        pen.sheen ? matMetal(pen.color) : matGloss(pen.color));
      barrel.position.y = 19;
      barrel.castShadow = true;
      barrel.userData = { type: 'pen', id: pen.id };
      // ink gauge: a pale ring that shrinks as the pen empties
      const inkBar = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.4, r + 0.4, 10, 14),
        matGloss('#e8e4da'));
      inkBar.position.y = 10;
      g.add(barrel); g.add(inkBar);
      caddy.add(g);
      pickables.push(barrel);
      penGroups[pen.id] = { group: g, barrel, inkBar, homeY: g.position.y };
    });

    const stack = new THREE.Group();
    stack.position.set(-PAPER_W / 2 - 130, 0, 40);
    scene.add(stack);
    papers.forEach((p, i) => {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(150, 2, 110),
        matMatte(p.color));
      sheet.rotation.y = (i - papers.length / 2) * 0.06;
      sheet.position.y = 1 + i * 2.4;
      sheet.castShadow = sheet.receiveShadow = true;
      sheet.userData = { type: 'paper', id: p.id };
      stack.add(sheet);
      pickables.push(sheet);
      paperSheets[p.id] = sheet;
    });
  }

  function setPenLevel(id, frac) {
    const e = penGroups[id]; if (!e) return;
    e.inkBar.scale.y = Math.max(0.04, frac);
    e.inkBar.position.y = 5 + 5 * Math.max(0.04, frac);
  }
  function setPenInCaddy(id, visible) {
    const e = penGroups[id]; if (e) e.group.visible = visible;
  }
  function setPaperSelected(id) {
    if (selectedPaperId && paperSheets[selectedPaperId])
      paperSheets[selectedPaperId].position.y -= 6;
    selectedPaperId = id;
    if (paperSheets[id]) paperSheets[id].position.y += 6;
  }
```

- [ ] **Step 2: Raycast picking + hover (scene.js, after the free-cam section)**

```js
  // Click-picks pens/paper; a drag (orbiting) is not a click. Hover raises
  // the object slightly and reports it for the tooltip.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pickCb = () => {}, hoverCb = () => {};
  let downXY = null, hovered = null;

  function castAt(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1,
            -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData : null;
  }
  renderer.domElement.addEventListener('pointerdown',
    e => { downXY = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (freeCam || !downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    downXY = null;
    if (moved < 6) { const u = castAt(e); if (u) pickCb(u); }
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (freeCam) return;
    const u = castAt(e);
    const key = u && u.type + u.id;
    if (key !== hovered) {
      hovered = key;
      renderer.domElement.style.cursor = u ? 'pointer' : '';
      hoverCb(u, e.clientX, e.clientY);
    } else if (u) hoverCb(u, e.clientX, e.clientY);
  });
```

Export from `createScene`: `buildInventory, onPick: f => pickCb = f, onHover: f => hoverCb = f, setPenLevel, setPenInCaddy, setPaperSelected`.

- [ ] **Step 3: Wire into index.html**

Add a tooltip div before `</style>` usage (`<div id=tip></div>` after `#panel`), CSS:

```css
#tip { position: fixed; background: rgba(20,22,26,0.9); color: #fff; padding: 4px 8px;
  border-radius: 4px; font-size: 11px; pointer-events: none; display: none; z-index: 10; }
```

After `applyPaper()`:

```js
scene.buildInventory(PENS, PAPERS);
scene.setPaperSelected(paperSel.id);
PENS.forEach(p => scene.setPenLevel(p.id, penState[p.id].ink));

const tip = document.getElementById('tip');
scene.onHover((u, x, y) => {
  if (!u) { tip.style.display = 'none'; return; }
  tip.style.display = '';
  tip.style.left = (x + 14) + 'px';
  tip.style.top = (y + 10) + 'px';
  tip.textContent = u.type === 'pen'
    ? `${penDef(u.id).name} · ${penDef(u.id).tip}mm · ink ${Math.round(penSimFor(u.id).ink * 100)}%`
    : PAPERS.find(p => p.id === u.id).name;
});
scene.onPick((u) => {
  if (plotLocked()) return;
  if (u.type === 'pen') selectPen(u.id);
  else { paperSel = { id: u.id, color: null }; scene.setPaperSelected(u.id); applyPaper(); refreshPanel(); }
});
```

Update `syncPen` to also call `scene.setPenLevel(id, penState[id].ink)`, and `penReplace`'s handler already calls `syncPen` (gauge refreshes for free).

- [ ] **Step 4: Verify**

Parse checks + `node --test`; `npx serve`: hover pens (tooltip w/ ink %), click a layer row then a pen → chip updates; click a paper sheet → it lifts and the machine's sheet recolors; orbit-drag does not trigger picks; picking locked mid-plot; H hides panel and tooltip behavior is unaffected.

- [ ] **Step 5: Commit**

```bash
git add code/scene.js index.html
git commit -m "feat: diegetic pen caddy and paper stack with raycast picking"
```

---

### Task 8: pen in the carriage + swap animation

**Files:**
- Modify: `code/scene.js` (carriage pen visuals, swap state machine in `render`), `index.html` (swap on layer change)

**Interfaces:**
- Consumes: `penGroups`, existing `penGroup`/`penBody`/`penTip` carriage meshes.
- Produces: `scene.setCarriagePen(penDef, color)` (instant), `scene.swapPen(penDef, color, done)` (animated lift-swap-drop, ~0.6 s; calls `done()` when finished).

- [ ] **Step 1: Carriage pen styling + swap machine (scene.js)**

```js
  // The pen in the carriage mirrors the assigned pen: barrel color, girth,
  // metallic finish. swapPen raises the head, changes the pen at the top of
  // the lift (the caddy pen blinks out, the old one returns), and drops back.
  let swap = null;   // {t, half, def, color, done}
  function applyCarriagePen(def, color) {
    const r = def.style === 'sharpie' ? 4.5 / 2.2 : def.style === 'brush' ? 3.2 / 2.2 : 1;
    penBody.scale.set(r, 1, r);
    penBody.material = def.sheen ? matMetal(color) : matGloss(color);
    penTip.material = penBody.material;
  }
  function setCarriagePen(def, color) { applyCarriagePen(def, color); }
  function swapPen(def, color, done) {
    swap = { t: 0, half: false, def, color, done };
  }
```

In `render()`, before the pen lift smoothing, add:

```js
    if (swap) {
      swap.t += dtMs / 600;                       // 0..1 over 0.6s
      const up = Math.sin(Math.min(swap.t, 1) * Math.PI) * 50;
      penGroup.position.y = PEN_UP + PAPER_TOP_Y + up;
      if (swap.t >= 0.5 && !swap.half) {
        swap.half = true;
        applyCarriagePen(swap.def, swap.color);
      }
      if (swap.t >= 1) { const d = swap.done; swap = null; d && d(); }
      // skip normal pen easing while swapping
    } else {
      const target = penDownTarget ? PEN_DOWN : PEN_UP;
      penY += (target - penY) * 0.25;
      penGroup.position.y = penY + PAPER_TOP_Y;
    }
```

(This wraps the existing two lines in the `else`.) Export `setCarriagePen, swapPen`.

- [ ] **Step 2: Trigger swaps on layer change (index.html)**

Replace the `sim.onLayer` body from Task 5 with:

```js
sim.onLayer = (i) => {
  const id = layerPens[i] ?? DEFAULT_PEN;
  if (id === activePenId) return;
  const prev = activePenId;
  if (prev) { syncPen(prev); scene.setPenInCaddy(prev, true); }
  activePenId = id;
  scene.setPenInCaddy(id, false);              // it's in the machine now
  const def = penDef(id), col = penColor(id);
  if (speed === 1 && sim.running && prev) {
    sim.pause();
    audio.penMove(false);                      // servo blip sells the swap
    scene.swapPen(def, col, () => sim.start());
  } else {
    scene.setCarriagePen(def, col);
  }
};
```

Also: in `resetBtn`'s handler and in `sim.onComplete`, return the active pen to the caddy: `if (activePenId) { scene.setPenInCaddy(activePenId, true); activePenId = null; }` (keep the existing sync in onComplete before nulling). Remove the now-redundant `scene.setPenColor` call from `onLayer` wiring and the `sim.onPenColor = (c) => scene.setPenColor(c);` line (`setPenColor` may stay in scene.js as dead API or be deleted — delete it and its export).

Note: `sim.onLayer` fires inside `sim.tick`, and `sim.pause()` mid-tick is safe — `tick`'s loop checks nothing after `running` is cleared except `remaining`, and the next loop iteration exits on `!this.running`? It does not — the while condition checks `remaining > 0 && !this.done`. **Therefore pause() inside onLayer does not stop the current tick.** Set a flag instead:

```js
let pendingSwap = null;   // {def, col} set by onLayer, consumed by the rAF loop
```

In `onLayer` (1× case): `pendingSwap = { def, col }; sim.pause();` — and in the `loop()` function, after `sim.tick(...)`, add:

```js
    if (pendingSwap) {
      const { def, col } = pendingSwap; pendingSwap = null;
      scene.swapPen(def, col, () => sim.start());
    }
```

`sim.pause()` inside the callback still prevents *further* ticks even though the current tick finishes its remaining time budget — at 1× that's ≤ one frame (~1 mm), acceptable.

- [ ] **Step 3: Verify**

Parse checks + `node --test`; `npx serve`: plot the 2-layer sample at 1× — when the red layer starts, the head lifts, the pen visibly changes (fatter/red as assigned), the caddy pen disappears while "in use," and plotting resumes. At 100×+ the swap is instant. Reset returns pens to the caddy.

- [ ] **Step 4: Commit**

```bash
git add code/scene.js index.html
git commit -m "feat: physical pen swap animation and carriage pen visuals"
```

---

### Task 9: docs + full verification pass

**Files:**
- Modify: `README.md` (controls section)

- [ ] **Step 1: Update README controls**

Replace the `- **Pen** — ink thickness...` bullet with:

```markdown
- **Pens** — click a layer, then click a pen in the caddy to assign it. Pens
  are real: each has its own tip width and line character, and its ink runs
  down as you plot (and stays down — levels persist). Click a pen and hit
  **Fresh** in the panel to replace a dead one; the color picker there
  overrides its ink color.
- **Paper** — click a sheet in the stack beside the machine: bristol,
  watercolor, cheap copy, or black card (that's what the white gel and
  metallic pens are for). Override its color in the panel.
```

- [ ] **Step 2: Full test + manual checklist**

Run: `node --test` — expected: inventory 2, penSim 10, sim 7, all pass. Then `npx serve` and walk:

1. Fresh profile (clear localStorage): sample.svg in Recent, plots with auto-assigned pens.
2. Assign Sharpie to a layer → fat soft line, touch-down blobs.
3. Ballpoint → visible dry-starts at stroke beginnings, rare skips.
4. Brush → line swells/thins organically.
5. Black card + gel white + metallic gold at 1× → opaque lines, glinting flecks; swap animation between layers.
6. Cheap copy → faint bleed halo; watercolor → broken toothy edges.
7. Plot repeatedly at 1000× until a fineliner passes below 15% → line fades and skips; hits 0 → stops marking; Fresh restores it. Reload → ink level survived.
8. F free-cam still flies; H hides panel + tooltip never lingers; orbit drag never picks.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document diegetic pens and paper"
```
