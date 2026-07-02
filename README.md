# Virtual Plotter

A 3D pen-plotter simulator in the browser. Drop in an SVG and watch a little
AxiDraw-style machine draw it on virtual paper — arm sliding, pen lifting,
stepper motors whirring. It doesn't make anything real but it's nice to watch.

# [LIVE DEMO](https://killedbyapixel.github.io/VirtualPlotter/)

![Virtual Plotter](screenshot.png)

## How To Use

Drag any SVG file onto the page and it loads onto the plotter. Then:

- **▶ Plot / ❚❚ Pause** — run or pause the drawing
- **Reset** — clear the ink and send the pen home
- **Speed** — 1× (real time) up to 1000× for the impatient
- **Plot** — draw all layers, or just one
- **Pen** — ink thickness, 0.3 mm to 2 mm (locked while a plot is running,
  like the layer colors)
- **Layer colors** — pick a pen color per layer before you start (Inkscape layers
  are detected automatically)
- **🔊** — mute the motor and servo sounds (they only play at 1× speed anyway)
- **F** — toggle a free-fly camera: the mouse locks for looking around and
  WASD + E/Q fly you through the scene; press F (or Esc) to return to orbit
- **H** — hide/show the whole interface (handy for a clean screenshot)

Recently plotted files are remembered so you can replay them. On a first
visit the Recent list starts with a built-in sample, so there's something to
plot before you have an SVG of your own.

## License

Copyright (C) 2026 Frank Force.

Released under the **GNU General Public License v3.0** — see [LICENSE](LICENSE).
You're free to use, study, share, and modify it, but any version you distribute
has to stay open source under the same license.
