# Pen & Paper Menu Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the panel a full, always-visible control surface (pen/tip/color, paper type/color, unlimited ink) synced two-way with the 3D caddy/stack; generic pen names; visible paper textures; spread the paper stack.

**Architecture:** State stays in index.html; the panel and the 3D objects are two views of it. Pens get an "effective definition" (inventory def + persisted color/tip overrides) held in a per-pen mutable object that live PenSim instances share, so edits apply immediately. Paper grain is baked into the ink canvas (per-pixel jitter + soft blotches), which the 3D sheet material displays automatically.

**Tech Stack:** Plain ES modules, three.js 0.160, 2D canvas, `node --test` (24 tests today).

**Spec:** `docs/superpowers/specs/2026-07-02-pen-paper-menu-design.md`

## Global Constraints

- No new dependencies, no build step; localStorage always in try/catch.
- Persistence keys: `plotter3d.pens` (gains optional per-pen `tip`), `plotter3d.paper` (unchanged), NEW `plotter3d.settings` = `{ unlimitedInk: bool, penId: string }`.
- Pen names contain no trademarks or color words: test-enforced `!/sharpie|red|blue|white|silver|gold/i`.
- The internal `style` string `'sharpie'` is renamed `'marker'` everywhere (inventory, penSim, scene).
- Unlimited ink disables depletion ONLY — dry-start/blob/brush/skip character unchanged (low-ink fade/skip never triggers because ink stays put).
- Pen/paper controls stay disabled while `plotLocked()` (existing `setSwatchesEnabled` path); the Unlimited checkbox stays enabled always (toggling mid-plot is safe).
- Existing behavior preserved: transport controls appear only after load; recents/sample seeding/mute/speed gate/F/H keys; multi-layer closest-color auto-assign; swap animation.
- Tip-size choices: 0.3, 0.5, 0.7, 1.0, 1.5, 2.0 mm.

---

### Task 1: penSim `unlimited` + generic renames

**Files:**
- Modify: `code/inventory.js`, `code/penSim.js`, `code/scene.js` (style string only)
- Test: `code/penSim.test.js`, `code/inventory.test.js` (append/adjust)

**Interfaces:**
- Produces: `PenSim` constructor accepts `{ ink, rng, unlimited }`; instance field `.unlimited` (settable at runtime). Inventory `name` fields become: fine03/fine05/fine05r/fine05b → `'Fineliner'`, sharpie → `'Marker'`, gel → `'Gel'`, silver/gold → `'Metallic'`, brush → `'Brush'`, ball → `'Ballpoint'`. `style: 'sharpie'` → `'marker'`. Ids and every other field unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `code/inventory.test.js`:

```js
test('pen names are generic: no trademarks or color words', () => {
  for (const p of PENS)
    assert.ok(!/sharpie|red|blue|white|silver|gold/i.test(p.name),
      `${p.id} name "${p.name}" not generic`);
});
```

Append to `code/penSim.test.js`:

```js
test('unlimited ink never depletes and can be toggled', () => {
  const ps = new PenSim(pen('fine05'), { unlimited: true });
  ps.penDown();
  ps.segment(0, 0, 100000, 0);            // 100 m of line
  assert.equal(ps.ink, 1);
  assert.equal(ps.segment(0, 0, 10, 0).length, 1);  // still draws normally
  ps.unlimited = false;
  ps.segment(0, 0, 1000, 0);
  assert.ok(ps.ink < 1, 'depletion resumes when toggled off');
});
```

- [ ] **Step 2: Run `node --test` — the two new tests FAIL** (name regex trips on current names; `unlimited` is undefined so ink depletes).

- [ ] **Step 3: Implement**

`code/inventory.js`: apply the renames listed in Interfaces (names + `style: 'marker'` for the sharpie entry). No other field changes.

`code/penSim.js`:
- constructor: `constructor(pen, { ink = 1, rng = createRng(1), unlimited = false } = {})` and `this.unlimited = unlimited;`
- in `segment()`, replace the spend lines with:

```js
    if (!this.unlimited) {
      const spend = (len / 1000 / pen.capacityM) * (pen.tip / REF_TIP);
      this.ink = Math.max(0, this.ink - spend);
    }
```

- in `segment()`, change `pen.style === 'sharpie'` to `pen.style === 'marker'`.

`code/scene.js`: replace both occurrences of `'sharpie'` (barrel radius in `buildInventory`, radius in `applyCarriagePen`) with `'marker'`.

- [ ] **Step 4: Run `node --test` — all 26 pass** (24 existing + 2 new). Also `node --check code/scene.js`.

- [ ] **Step 5: Commit**

```bash
git add code/inventory.js code/inventory.test.js code/penSim.js code/penSim.test.js code/scene.js
git commit -m "feat: unlimited-ink option and generic pen names"
```

---

### Task 2: paper texture bake + stack spread + pen selection highlight

**Files:**
- Modify: `code/scene.js`

**Interfaces:**
- Produces: `scene.setPenSelected(id|null)` (selected caddy pen lifts, like the selected paper sheet). Grain is now baked into the canvas by `clearInk`, so `setPaper`/`resetInk`/`loadArtwork` all re-bake automatically.

- [ ] **Step 1: Bake grain in clearInk**

`paperState` and everything else stay as-is; only `clearInk` changes (plus the new `bakeGrain` beside it):

```js
  const clearInk = () => {
    ctx.globalAlpha = 1;
    ctx.fillStyle = paperState.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bakeGrain();
  };

  // Paper tooth: per-pixel luminance jitter scaled by grain, plus a few soft
  // blotches on heavy-grain papers (watercolor) so it doesn't read as uniform
  // noise. Baked once per clear; ink draws over it.
  function bakeGrain() {
    const g = paperState.grain;
    if (!g) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 34 * g;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    if (g >= 0.3) {
      for (let i = 0; i < 14; i++) {
        const x = Math.random() * canvas.width, y = Math.random() * canvas.height;
        const r = 60 + Math.random() * 200;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(139,130,114,' + (0.05 * g).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(139,130,114,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
      }
    }
  }
```

- [ ] **Step 2: Spread the stack + pen selection highlight**

In `buildInventory`'s papers loop, change the fan so sheets read as separate objects:

```js
      sheet.rotation.y = (i - papers.length / 2) * 0.16;
      sheet.position.set((i % 2 ? 10 : -10), 1 + i * 3.2, (i - papers.length / 2) * 14);
```

(The selected-sheet `+6` lift in `setPaperSelected` is unchanged.)

Next to `setPaperSelected`, add and export a matching pen highlight:

```js
  let selectedPenId3d = null;
  function setPenSelected(id) {
    const prev = penGroups[selectedPenId3d];
    if (prev) prev.group.position.y = prev.homeY;
    selectedPenId3d = id;
    const cur = penGroups[id];
    if (cur) cur.group.position.y = cur.homeY + 6;
  }
```

Export `setPenSelected` from the returned object.

- [ ] **Step 3: Verify** — `node --check code/scene.js`; `node --test` (26 pass).

- [ ] **Step 4: Commit**

```bash
git add code/scene.js
git commit -m "feat: baked paper grain, spread paper stack, caddy selection highlight"
```

---

### Task 3: always-visible settings panel, tip select, unlimited checkbox, two-way sync

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: everything from Tasks 1-2 (`unlimited` field, `setPenSelected`).
- Produces: `effDef(id)` (mutable effective pen def shared with the pen's PenSim), `penTip(id)`, `settings` (`{unlimitedInk, penId}`) — used by the rest of index.html.

- [ ] **Step 1: Markup + CSS**

In `#controls`, DELETE the `#penInfo` row and the Paper row (the `<div class=row><label>Paper ...</label></div>`). After the `#controls` div (still inside `#panel`, before `#recent`), add:

```html
  <div id=setup>
    <div class=row>
      <input type=color id=penInkColor title="Pen ink color">
      <select id=penSel title="Pen"></select>
      <select id=tipSel title="Tip size"></select>
      <span id=penInfoInk style="color:#888"></span>
      <button id=penReplace title="Swap in a fresh pen">Fresh</button>
    </div>
    <div class=row>
      <label>Paper
        <select id=paperTypeSel></select>
        <input type=color id=paperColor title="Paper color">
      </label>
    </div>
    <label class=row style="cursor:pointer">
      <input type=checkbox id=unlimitedInk> Unlimited ink
    </label>
  </div>
```

CSS: change the `#penInfo input[type=color], #paperColor` rule selector to `#setup input[type=color]`; add `#setup select { font-size: 12px; max-width: 110px; }` and `#penReplace { padding: 2px 8px; font-size: 11px; }`.

- [ ] **Step 2: Settings + effective defs (state layer)**

After the `penColor` const, add:

```js
// Last selected pen + unlimited-ink flag persist separately from pen state.
const SETTINGS_KEY = 'plotter3d.settings';
let settings = { unlimitedInk: false, penId: DEFAULT_PEN };
try { settings = { ...settings, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; } catch {}
if (!PENS.some(p => p.id === settings.penId)) settings.penId = DEFAULT_PEN;
function persistSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

const penTip = (id) => penState[id].tip || penDef(id).tip;

// Effective defs: inventory def + user overrides, held in ONE mutable object
// per pen that its PenSim shares — editing tip mid-session applies instantly.
const effDefs = {};
function effDef(id) {
  if (!effDefs[id]) effDefs[id] = { ...penDef(id) };
  applyTip(effDefs[id], id);
  return effDefs[id];
}
function applyTip(eff, id) {
  const def = penDef(id), t = penTip(id);
  eff.tip = t;
  if (def.tipMin) {           // brush swell scales around the chosen tip
    eff.tipMin = def.tipMin * (t / def.tip);
    eff.tipMax = def.tipMax * (t / def.tip);
  }
}
```

Change `penSimFor` to use the effective def and the unlimited flag:

```js
function penSimFor(id) {
  if (!penSims[id]) penSims[id] = new PenSim(effDef(id),
    { ink: penState[id].ink, rng: createRng(1234), unlimited: settings.unlimitedInk });
  return penSims[id];
}
```

- [ ] **Step 3: Populate the new controls and rewire selection**

Replace the `let selectedLayer = 0; let selectedPenId = null;` block region (declarations of `penInfo`/`paperColor`/`paperName`, `setSwatchesEnabled`, `selectLayer`, `selectPen`, `refreshPanel`) with:

```js
let selectedLayer = 0;
let selectedPenId = settings.penId;      // always a valid pen from startup
const paperColor = document.getElementById('paperColor');
const penSel = document.getElementById('penSel');
const tipSel = document.getElementById('tipSel');
const paperTypeSel = document.getElementById('paperTypeSel');
const unlimitedBox = document.getElementById('unlimitedInk');

PENS.forEach((p, i) => {
  const o = document.createElement('option');
  o.value = p.id; o.textContent = p.name;
  penSel.appendChild(o);
});
for (const t of [0.3, 0.5, 0.7, 1.0, 1.5, 2.0]) {
  const o = document.createElement('option');
  o.value = String(t); o.textContent = t.toFixed(1) + ' mm';
  tipSel.appendChild(o);
}
PAPERS.forEach(p => {
  const o = document.createElement('option');
  o.value = p.id; o.textContent = p.name;
  paperTypeSel.appendChild(o);
});
unlimitedBox.checked = settings.unlimitedInk;

function setSwatchesEnabled(on) {   // pen/paper setup lock while plotting
  for (const el of [penSel, tipSel, paperTypeSel, paperColor,
    document.getElementById('penInkColor'), document.getElementById('penReplace')])
    el.disabled = !on;
}

function selectLayer(i) {
  selectedLayer = i;
  if (layerPens[i]) { selectedPenId = layerPens[i]; onPenSelected(); }
  refreshPanel();
}

function selectPen(id) {
  selectedPenId = id;
  if (loaded && !plotLocked()) assignPen(selectedLayer, id);
  onPenSelected();
  refreshPanel();
}

function onPenSelected() {
  settings.penId = selectedPenId;
  persistSettings();
  scene.setPenSelected(selectedPenId);
}

function refreshPanel() {
  layersDiv.querySelectorAll('.layer-row').forEach((row, i) => {
    row.classList.toggle('sel', i === selectedLayer);
    row.querySelector('.dot').style.background = penColor(layerPens[i]);
    row.querySelector('.pen-name').textContent = penDef(layerPens[i]).name;
  });
  penSel.value = selectedPenId;
  tipSel.value = String(penTip(selectedPenId));
  document.getElementById('penInkColor').value = penColor(selectedPenId);
  document.getElementById('penInfoInk').textContent =
    Math.round(penSimFor(selectedPenId).ink * 100) + '%';
  paperTypeSel.value = paperSel.id;
  paperColor.value = paperSel.color || paperDef().color;
}
buildLayerUI._refresh = refreshPanel;
```

- [ ] **Step 4: New control handlers + sync**

After the existing `paperColor` input handler, add:

```js
penSel.addEventListener('change', () => selectPen(penSel.value));
tipSel.addEventListener('change', () => {
  const t = parseFloat(tipSel.value);
  if (t === penDef(selectedPenId).tip) delete penState[selectedPenId].tip;
  else penState[selectedPenId].tip = t;
  persistPens();
  applyTip(effDef(selectedPenId), selectedPenId);
  refreshPanel();
});
paperTypeSel.addEventListener('change', () => {
  if (plotLocked()) { refreshPanel(); return; }
  paperSel = { id: paperTypeSel.value, color: null };
  scene.setPaperSelected(paperSel.id);
  applyPaper();
  refreshPanel();
});
unlimitedBox.addEventListener('change', () => {
  settings.unlimitedInk = unlimitedBox.checked;
  persistSettings();
  for (const id in penSims) penSims[id].unlimited = settings.unlimitedInk;
});
```

Adjust the rest of index.html to the new world:

- `sim.onLayer` and the swap path: `const def = penDef(id)` → `const def = effDef(id)`.
- `sim.onInk`: `const def = penDef(id)` → `const def = effDef(id)` (sheen flag identical, but keep one source).
- Tooltip: `penDef(u.id).tip` → `penTip(u.id)`.
- `loadSvgText`: single-layer SVGs use the selected pen —

```js
  layerPens = data.layerInfo.length === 1
    ? [selectedPenId]
    : data.layerInfo.map(l => closestPen(l.color));
```

- Startup (after `PENS.forEach(p => scene.setPenLevel(...))`): add `scene.setPenSelected(selectedPenId); refreshPanel();` — note `refreshPanel` must be defined before this runs; if the declaration order fights, move the startup call block to after the handler section (end of the script, before the rAF loop) instead.

- [ ] **Step 5: Verify**

Extract the inline module to a temp .mjs and `node --check`; `node --test` (26). Manual browser (controller/human): fresh load shows pen/paper/unlimited controls + Recent; pen dropdown ↔ caddy clicks sync both ways (selected pen lifts); tip change fattens the next plot's lines and drains ink faster; unlimited ink freezes the ink %; paper dropdown ↔ stack clicks sync; single-layer sample uses the selected pen.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: always-visible pen/paper menu with tip size, unlimited ink, and 3D sync"
```

---

### Task 4: README + verification pass

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Pens/Paper bullets**

Replace the current `- **Pens** ...` and `- **Paper** ...` bullets with:

```markdown
- **Pens** — pick a pen in the panel or by clicking one in the caddy. Every
  pen's ink color and tip size are editable; each has its own line character
  (the marker blobs, the ballpoint dry-starts, the brush swells) and its ink
  runs down as you plot — levels persist between visits. **Fresh** replaces a
  dead pen, or tick **Unlimited ink** to never worry about it.
- **Paper** — choose a paper type in the panel or click the stack beside the
  machine: bristol, watercolor (toothy), cheap copy (bleeds a little), or
  black card (that's what the gel and metallic pens are for). The color
  picker overrides the sheet color.
```

- [ ] **Step 2: Full suite** — `node --test` (26 expected: inventory 3, penSim 11, plotExtract 4, sim 8).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: pen/paper menu, tip sizes, unlimited ink"
```
