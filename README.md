# Virtual Plotter

A 3D pen-plotter simulator in the browser. Drop in an SVG and watch a little
AxiDraw-style machine draw it on virtual paper — arm sliding, pen lifting,
stepper motors whirring. It doesn't make anything real. It's just nice to watch.

![Virtual Plotter](screenshot.png)

## Use it

Drag any SVG file onto the page and it loads onto the plotter. Then:

- **▶ Plot / ❚❚ Pause** — run or pause the drawing
- **Reset** — clear the ink and send the pen home
- **Speed** — 1× (real time) up to 1000× for the impatient
- **Plot** — draw all layers, or just one
- **Layer colors** — pick a pen color per layer before you start (Inkscape layers
  are detected automatically)
- **🔊** — mute the motor and servo sounds (they only play at 1× speed anyway)
- **F** — toggle a free-fly camera: the mouse locks for looking around and
  WASD + E/Q fly you through the scene; press F (or Esc) to return to orbit
- **H** — hide/show the whole interface (handy for a clean screenshot)

Recently plotted files are remembered so you can replay them.

## Run it locally

It's plain HTML + JavaScript with no build step, but it uses ES modules, so it
needs to be served over HTTP rather than opened as a `file://` URL. Any static
server works:

```sh
npx serve
# or
python -m http.server
```

Then open the printed URL and drop in an SVG. [three.js](https://threejs.org/)
is loaded from a CDN, so you'll need to be online the first time.

## Tests

The plot simulation (`sim.js`) has a small unit-test suite that runs on Node
with no dependencies:

```sh
node --test
```

## License

Copyright (C) 2026 Frank Force.

Released under the **GNU General Public License v3.0** — see [LICENSE](LICENSE).
You're free to use, study, share, and modify it, but any version you distribute
has to stay open source under the same license.
