# Diegetic Pens & Paper — Design

The scene becomes the UI. Settings that describe physical things (pens, paper)
become clickable 3D objects on the desk; the panel keeps only transport
controls and true settings. Pens are simulated objects with finite ink and
per-type line character; papers change the surface and how ink sits on it.

## Goals

- A pen caddy beside the machine holding a roster of real-style pens; click to
  select/assign, and the assigned pen physically swaps into the carriage when
  its layer plots.
- A paper stack on the other side of the machine; click to load a paper type.
- Pens have finite ink that depletes with millimeters drawn, degrades the line
  as it runs low, persists across sessions, and can be replaced fresh.
- Per-type line character (crisp fineliner, fattening Sharpie, speed-width
  brush pen, dry-starting/skipping ballpoint, opaque gel/metallic).
- Panel gains override color pickers: ink color per pen and paper color, so
  fixed real-pen identities never remove color freedom.

## Out of scope (shelved, not rejected)

- Subtractive ink blending / multiply chemistry (multiply is not true
  subtractive mixing; do it right later or not at all).
- Gallery wall / finished-plot history.
- True specular/metalness rendering for metallic ink (v1 fakes it with a
  sparkle-noise sheen in the 2D ink).

## Components

1. **`code/inventory.js`** — data-only definitions of pen archetypes and paper
   types (name, tip width mm, default color, opacity, ink capacity in meters,
   behavior flags/params; paper base color + grain/bleed params).
2. **`code/penSim.js`** — pure logic, no DOM/three.js. Input: ink segments
   (from `PlotSim.onInk`) plus the active pen's state. Output: draw ops
   `{ax, ay, bx, by, color, widthMm, alpha}` or nothing (skips/gaps). Owns ink
   depletion, dry-start gaps, low-ink fade/skip, dwell fattening, brush
   speed-width. Uses a seeded RNG so behavior is unit-testable and replays are
   deterministic per plot.
3. **`code/scene.js`** — caddy + paper-stack meshes, raycast picking with
   hover highlight, floating info label (name, tip, ink %), pen visible in the
   carriage, pen-swap animation (machine parks, old pen returns to caddy, new
   pen flies in; instant above 1× speed), paper base color/grain on the ink
   canvas, and a draw-op renderer honoring per-op width/alpha.
4. **`index.html`** — panel rework: per-layer pen chips replace color
   swatches; the Pen thickness select is removed (thickness is a pen
   property); override color pickers for the selected pen's ink and for the
   paper; persistence.

## Pen roster (initial)

| Pen | Tip | Character |
|---|---|---|
| Fineliner black | 0.3 | crisp, uniform |
| Fineliner black / red / blue | 0.5 | crisp, uniform |
| Sharpie black | 2.0 | soft edge, fattens when dwelling |
| Gel white | 0.7 | opaque (for black card) |
| Metallic silver / gold | 1.0 | opaque + sparkle sheen |
| Brush pen black | 0.5–2.5 | width follows pen speed |
| Ballpoint blue | 0.5 | dry-starts after pen-down, occasional skips |

Ink capacity is meters-of-line scaled by tip width, tuned so a pen survives
several typical plots. Below ~15% remaining the line fades and skip
probability rises; an empty pen marks nothing. Clicking a pen offers a fresh
replacement (pens are free; the act is the point).

## Papers (initial)

| Paper | Surface |
|---|---|
| Bristol | bright white, clean lines |
| Watercolor | off-white, grain breaks line edges |
| Cheap copy | gray-white, slight bleed (line drawn twice, wider at low alpha) |
| Black card | near-black; the reason gel/metallic exist |

Paper choice tints the 3D paper material and the ink-canvas background, and
is locked while a plot runs (like pens/colors today).

## Interaction model

- Click a layer row (selects it), then click a pen in the caddy → assigned.
  Clicking a pen first selects the pen (info label); clicking a layer then
  assigns it. Single-layer SVGs assign directly on pen click.
- SVGs with more layers than assigned pens fall back to the default 0.5
  fineliner per extra layer.
- All pen/paper interaction is locked mid-plot (same rule and code path as
  today's swatch locking).

## Persistence

- `plotter3d.pens` — ink level (and color override) per pen id.
- `plotter3d.paper` — selected paper id + color override.
- Same best-effort try/catch pattern as existing keys; storage failure means
  defaults, in-memory only.

## Testing

`penSim.js` gets a node test suite beside `sim.test.js`: depletion math,
dry-start gap length, deterministic skips under a seeded RNG, brush
width-vs-speed curve, low-ink fade thresholds, empty pen emits nothing,
replacement resets state. Scene/UI remain manually verified (no test
infrastructure for canvas/three.js, deliberately).

## Build stages

1. `inventory.js` + `penSim.js` with tests (pure logic, TDD).
2. Wire penSim between `sim.onInk` and the canvas; draw-op renderer in scene.
3. Caddy + paper stack meshes, raycasting, selection/assignment, info label.
4. Panel rework (pen chips, override pickers, remove thickness select),
   persistence.
5. Pen-swap animation + polish (sheen, grain, bleed tuning, placement so the
   caddy doesn't fight the default camera).
