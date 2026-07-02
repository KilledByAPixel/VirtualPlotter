import test from 'node:test';
import assert from 'node:assert/strict';
import { PlotSim } from './sim.js';

// Run a loaded sim to completion in small steps, recording events.
function runToEnd(sim, stepMs = 5, maxSteps = 200000) {
  const ev = { ink: [], pose: [], colors: [], layers: [], complete: 0 };
  sim.onInk = (ax, ay, bx, by, c) => ev.ink.push([ax, ay, bx, by, c]);
  sim.onPose = (x, y, d) => ev.pose.push([x, y, d]);
  sim.onPenColor = (c) => ev.colors.push(c);
  sim.onLayer = (i) => ev.layers.push(i);
  sim.onComplete = () => ev.complete++;
  sim.start();
  let n = 0;
  while (!sim.isComplete() && n++ < maxSteps) sim.tick(stepMs);
  return ev;
}
const inkLen = (ink) =>
  ink.reduce((s, [ax, ay, bx, by]) => s + Math.hypot(bx - ax, by - ay), 0);

test('draws a single straight stroke, total ink ~= stroke length', () => {
  const sim = new PlotSim();
  sim.load([[[0, 0], [100, 0]]], [0], [{ name: 'a', color: '#000' }],
           { downSpeed: 100, upSpeed: 200, liftMs: 0 });
  const ev = runToEnd(sim);
  assert.ok(Math.abs(inkLen(ev.ink) - 100) < 0.5, `ink len ${inkLen(ev.ink)}`);
  assert.equal(ev.complete, 1);
  assert.ok(sim.isComplete());
});

test('pen travels up to the first point before drawing', () => {
  const sim = new PlotSim();
  sim.load([[[10, 10], [20, 10]]], [0], [{ name: 'a', color: '#000' }],
           { downSpeed: 100, upSpeed: 200, liftMs: 0 });
  const ev = runToEnd(sim);
  // The very first pose emitted while moving to the stroke start is pen-up.
  assert.equal(ev.pose[0][2], false);
  // At least one pen-down pose is emitted during drawing.
  assert.ok(ev.pose.some(p => p[2] === true));
});

test('emits a pen-color change per layer', () => {
  const sim = new PlotSim();
  sim.load(
    [[[0, 0], [10, 0]], [[0, 5], [10, 5]]],
    [0, 1],
    [{ name: 'a', color: '#000000' }, { name: 'b', color: '#c22d2d' }],
    { downSpeed: 100, upSpeed: 200, liftMs: 0 });
  const ev = runToEnd(sim);
  assert.deepEqual(ev.colors, ['#000000', '#c22d2d']);
  assert.deepEqual(ev.layers, [0, 1]);
  // Ink segments carry their layer color.
  assert.ok(ev.ink.some(s => s[4] === '#000000'));
  assert.ok(ev.ink.some(s => s[4] === '#c22d2d'));
});

test('layer filter plots only the selected layer', () => {
  const sim = new PlotSim();
  sim.load(
    [[[0, 0], [10, 0]], [[0, 5], [10, 5]]],
    [0, 1],
    [{ name: 'a', color: '#000000' }, { name: 'b', color: '#c22d2d' }],
    { downSpeed: 100, upSpeed: 200, liftMs: 0 });
  sim.setLayerFilter(1);
  const ev = runToEnd(sim);
  assert.deepEqual(ev.colors, ['#c22d2d']);
  assert.ok(ev.ink.every(s => s[4] === '#c22d2d'));
});

test('parks the pen back at home (0,0), pen up, after the last stroke', () => {
  const sim = new PlotSim();
  sim.load([[[10, 10], [40, 10]]], [0], [{ name: 'a', color: '#000' }],
           { downSpeed: 100, upSpeed: 200, liftMs: 0 });
  const ev = runToEnd(sim);
  const lastPose = ev.pose[ev.pose.length - 1];
  // Final resting pose is the home corner, pen lifted.
  assert.deepEqual([lastPose[0], lastPose[1]], [0, 0]);
  assert.equal(lastPose[2], false);
  // Home is reached by moving, not teleporting: the pen leaves the stroke end
  // (40,10) and passes through intermediate points on the way back.
  const homeward = ev.pose.filter(p => p[2] === false && p[0] < 40 && p[0] > 0);
  assert.ok(homeward.length > 0, 'expected animated travel back to home');
});

test('reset returns to a fresh, incomplete, non-running state', () => {
  const sim = new PlotSim();
  sim.load([[[0, 0], [10, 0]]], [0], [{ name: 'a', color: '#000' }],
           { downSpeed: 100, upSpeed: 200, liftMs: 0 });
  runToEnd(sim);
  sim.reset();
  assert.equal(sim.isComplete(), false);
  assert.equal(sim.running, false);
});

test('empty stroke set completes immediately', () => {
  const sim = new PlotSim();
  sim.load([], [], [], { downSpeed: 100, upSpeed: 200, liftMs: 0 });
  assert.equal(sim.isComplete(), true);
});
