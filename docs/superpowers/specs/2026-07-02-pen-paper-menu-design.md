# Pen & Paper Menu Merge — Design

The panel becomes a full, always-available control surface for the same state
the 3D caddy/stack expose: two views, one state. Plus generic pen naming,
an unlimited-ink option, and genuinely visible paper textures.

## Goals

1. **Generic pen names** (no trademarks, no color words): names are type +
   context only — Fineliner, Marker (was "Sharpie"), Gel, Metallic, Brush,
   Ballpoint. The color swatch communicates color; tip size is shown as its
   own field. The three colored fineliners keep their default colors but are
   named identically ("Fineliner") — they are slots you customize.
2. **Unlimited ink** — a persisted checkbox (default OFF, label "Unlimited
   ink") that disables ink depletion (and therefore low-ink fade/skips).
   Type character (Marker touch-down blob, Ballpoint dry-start/skips, Brush
   swell) is unaffected — it's personality, not consumable.
3. **Always-visible settings** — the panel shows, from startup (before any
   SVG is loaded): a Pen row (color swatch, pen `<select>`, tip-size
   `<select>` 0.3/0.5/0.7/1.0/1.5/2.0 mm, ink % + Fresh button) and a Paper
   row (paper-type `<select>`, color swatch). Loading a single-layer SVG
   assigns the currently selected pen; multi-layer keeps closest-color
   auto-assign. The transport controls (Plot/Reset/Speed/layers) still appear
   only once an SVG is loaded.
4. **Editable tip size per pen** — persisted per pen alongside the color
   override; drives line width, ink burn rate (existing `tip/0.5` scaling),
   and brush swell midpoint (brush's tipMin/tipMax scale proportionally with
   the chosen tip relative to its default).
5. **Two-way sync** — clicking a 3D pen updates the panel selection; choosing
   from the pen dropdown highlights the pen in the caddy (selected pen lifts
   slightly, like the selected paper sheet). Same for paper both ways.
6. **Visible paper texture** — procedural grain baked into the ink canvas
   when paper is applied: watercolor = fine tooth speckle + a few soft
   blotches; cheap copy = faint gray fiber streaks; bristol/black = clean.
   Because the 3D sheet's material maps this canvas, the texture is visible
   in the scene automatically. Ink draws on top; reset re-bakes.
7. **Paper stack spread** — larger per-sheet rotation and offset in the 3D
   stack so each sheet reads as a separate, clickable object.

## Out of scope

- Real specular metallic (still shelved), gallery wall, ink chemistry.
- Renaming/removing pen slots dynamically; adding new pens at runtime.
- 3D barrel girth updates when tip changes (polish, later).

## State & persistence

- `plotter3d.pens` gains optional per-pen `tip` override:
  `{ [id]: { ink, color?, tip? } }`.
- New key `plotter3d.settings`: `{ unlimitedInk: bool, penId: string }`
  (last selected pen, so a first-load single-layer SVG uses it).
- `plotter3d.paper` unchanged (`{ id, color }`).
- Effective pen definition = inventory def + overrides (color, tip). PenSim
  instances receive a per-pen effective-def object that the app mutates in
  place on tip change, so behavior follows immediately.

## penSim change

`PenSim` gets an `unlimited` boolean (constructor option + settable field).
When true, `segment()` skips the ink spend; everything else unchanged. Ink
level stays wherever it was (turning the box off resumes depletion from
there).

## UI structure (panel)

```
[hint (pre-load) / transport rows (loaded)]
Pen   [swatch][pen select        ][tip select][ink 62% ][Fresh]
Paper [paper select   ][swatch]
[ ] Unlimited ink
[layer list (loaded, multi-layer)]
[Recent]
```

Pen select options show name only ("Fineliner", "Marker", …); duplicate
names are allowed (the swatch differentiates). Selecting a pen shows ITS
swatch/tip/ink. Locking rules unchanged: everything pen/paper is disabled
while a plot runs (`setSwatchesEnabled` / `plotLocked`).

## Testing

- penSim: unlimited flag — draw far, ink stays; toggling off resumes spend.
- inventory: names contain no trademarks/color words (test asserts the
  rename happened: no pen name matches /sharpie|red|blue|white|silver|gold/i).
- Panel/scene sync and textures: manual browser verification.
