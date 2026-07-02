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
