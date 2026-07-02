'use strict';
// Pure plot-clock state machine. No DOM. Drives the 3D sim via callbacks.

function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

export class PlotSim {
  constructor() {
    this.onPose = () => {};
    this.onInk = () => {};
    this.onPenColor = () => {};
    this.onLayer = () => {};
    this.onComplete = () => {};
    this.running = false;
    this.done = false;
    this._order = [];
  }

  load(strokes, strokeLayers, layerInfo, settings = {}) {
    this.allStrokes = strokes || [];
    this.allLayers = strokeLayers || [];
    this.layerInfo = layerInfo || [];
    this.downSpeed = settings.downSpeed ?? 60;
    this.upSpeed = settings.upSpeed ?? 200;
    this.liftMs = settings.liftMs ?? 240;
    this.layerFilter = null;
    this._build();
  }

  setLayerFilter(idx) {
    this.layerFilter = (idx == null ? null : +idx);
    this._build();
  }

  _build() {
    this._order = [];
    for (let i = 0; i < this.allStrokes.length; i++) {
      if (this.layerFilter == null || this.allLayers[i] === this.layerFilter) {
        this._order.push(i);
      }
    }
    this.reset();
  }

  reset() {
    this.running = false;
    this.done = !this._order || this._order.length === 0;
    this._pos = 0;
    this._segIdx = 0;
    this._mode = 'travel';
    this._penPos = [0, 0];
    this._liftRemain = 0;
    this._curColor = null;
    this._curLayer = null;
    this._homing = false;
    this._travelTarget = this._firstPoint(0);
    this.onPose(this._penPos[0], this._penPos[1], false);
  }

  _firstPoint(orderPos) {
    const si = this._order[orderPos];
    const s = si == null ? null : this.allStrokes[si];
    return s && s.length ? s[0] : null;
  }

  start() { if (!this.done) this.running = true; }
  pause() { this.running = false; }
  isComplete() { return !!this.done; }

  tick(dtMs) {
    if (!this.running || this.done) return;
    let remaining = dtMs;
    let safety = 1e7;
    while (remaining > 0 && !this.done && safety-- > 0) {
      if (this._mode === 'travel') {
        const t = this._travelTarget;
        if (!t) { this.done = true; break; }
        const segLen = dist(this._penPos[0], this._penPos[1], t[0], t[1]);
        if (segLen === 0) { this._arriveTravel(); continue; }
        const need = segLen / (this.upSpeed / 1000);
        if (remaining >= need) {
          this._penPos = [t[0], t[1]];
          remaining -= need;
          this.onPose(t[0], t[1], false);
          this._arriveTravel();
        } else {
          const f = (remaining * (this.upSpeed / 1000)) / segLen;
          this._penPos = [this._penPos[0] + (t[0] - this._penPos[0]) * f,
                          this._penPos[1] + (t[1] - this._penPos[1]) * f];
          this.onPose(this._penPos[0], this._penPos[1], false);
          remaining = 0;
        }
      } else if (this._mode === 'drop' || this._mode === 'lift') {
        if (this._liftRemain <= 0) {
          if (this._mode === 'drop') this._beginDraw();
          else this._afterLift();
          continue;
        }
        const used = Math.min(remaining, this._liftRemain);
        this._liftRemain -= used;
        remaining -= used;
      } else if (this._mode === 'draw') {
        const stroke = this.allStrokes[this._order[this._pos]];
        if (!stroke || this._segIdx >= stroke.length - 1) {
          this._mode = 'lift';
          this._liftRemain = this.liftMs / 2;
          continue;
        }
        const b = stroke[this._segIdx + 1];
        const toB = dist(this._penPos[0], this._penPos[1], b[0], b[1]);
        if (toB === 0) { this._segIdx++; continue; }
        const need = toB / (this.downSpeed / 1000);
        if (remaining >= need) {
          this.onInk(this._penPos[0], this._penPos[1], b[0], b[1], this._curColor);
          this._penPos = [b[0], b[1]];
          this.onPose(b[0], b[1], true);
          this._segIdx++;
          remaining -= need;
        } else {
          const f = (remaining * (this.downSpeed / 1000)) / toB;
          const nx = this._penPos[0] + (b[0] - this._penPos[0]) * f;
          const ny = this._penPos[1] + (b[1] - this._penPos[1]) * f;
          this.onInk(this._penPos[0], this._penPos[1], nx, ny, this._curColor);
          this._penPos = [nx, ny];
          this.onPose(nx, ny, true);
          remaining = 0;
        }
      }
    }
    if (this.done) { this.running = false; this.onComplete(); }
  }

  _startDrop() {
    this._travelTarget = null;
    const layer = this.allLayers[this._order[this._pos]];
    if (layer !== this._curLayer) { this._curLayer = layer; this.onLayer(layer); }
    const color = this.layerInfo[layer]?.color || '#000000';
    if (color !== this._curColor) { this._curColor = color; this.onPenColor(color); }
    this._mode = 'drop';
    this._liftRemain = this.liftMs / 2;
  }

  _beginDraw() {
    this._mode = 'draw';
    this._segIdx = 0;
    this.onPose(this._penPos[0], this._penPos[1], true);
  }

  // Reached a travel target with the pen up. Either drop to draw the next
  // stroke, or — if this was the final return-home move — finish.
  _arriveTravel() {
    if (this._homing) { this.done = true; return; }
    this._startDrop();
  }

  _afterLift() {
    this._pos++;
    if (this._pos >= this._order.length) {
      // All strokes drawn: park the pen back at the home corner with a normal
      // pen-up travel move before finishing, the same way a real plotter does.
      this._mode = 'travel';
      this._homing = true;
      this._travelTarget = [0, 0];
      return;
    }
    this._mode = 'travel';
    this._travelTarget = this._firstPoint(this._pos);
  }
}
