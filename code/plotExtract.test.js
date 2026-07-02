import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveSample } from './plotExtract.js';

// Distance from point p to the polyline pts, for checking sample fidelity.
function distToPolyline(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
  }
  return best;
}

test('straight runs stay sparse (no pointless refinement)', () => {
  const pts = adaptiveSample(l => [l, 0], 100, { baseStep: 10, tol: 0.05 });
  assert.ok(pts.length <= 12, `expected ~11 points, got ${pts.length}`);
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts[pts.length - 1], [100, 0]);
});

test('a hard corner between base samples gets points at the corner', () => {
  // L-shaped curve: along +x for 10, then up +y for 10; corner at (10, 0).
  // baseStep 8 puts samples at l = 0, 8, 16, 20 — the corner (l=10) falls
  // between samples and would be cut off without refinement.
  const pointAt = l => (l <= 10 ? [l, 0] : [10, l - 10]);
  const pts = adaptiveSample(pointAt, 20, { baseStep: 8, tol: 0.05 });
  assert.ok(pts.some(([x, y]) => Math.hypot(x - 10, y) < 0.2),
    'no sample landed near the corner');
  // The sampled polyline must hug the true curve everywhere.
  for (let l = 0; l <= 20; l += 0.1) {
    assert.ok(distToPolyline(pointAt(l), pts) < 0.25,
      `polyline strays from curve at l=${l.toFixed(1)}`);
  }
});

test('a tight curve is refined below tolerance', () => {
  // Quarter circle radius 2 (length ~3.14) walked with one giant base step.
  const r = 2;
  const pointAt = l => {
    const a = l / r;
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  const len = (Math.PI / 2) * r;
  const pts = adaptiveSample(pointAt, len, { baseStep: len, tol: 0.05 });
  for (let l = 0; l <= len; l += len / 100) {
    assert.ok(distToPolyline(pointAt(l), pts) < 0.1,
      `arc strays from curve at l=${l.toFixed(2)}`);
  }
});

test('degenerate inputs are safe', () => {
  assert.deepEqual(adaptiveSample(l => [l, 0], 0, { baseStep: 1 }), []);
  const pts = adaptiveSample(() => [5, 5], 10, { baseStep: 1, tol: 0.05 });
  assert.ok(pts.length >= 2);            // constant curve: no infinite recursion
});
