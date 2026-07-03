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

test('non-realistic (perfect) ink: no depletion, dry starts, skips, or blobs', () => {
  // rng always 0 would trigger every skip roll if skips were still gated in
  const ball = new PenSim(pen('ball'), { realistic: false, rng: () => 0 });
  ball.penDown();
  assert.equal(ball.segment(0, 0, 1, 0).length, 1, 'no dry start');
  assert.equal(ball.segment(1, 0, 50, 0).length, 1, 'no random skips');

  const mk = new PenSim(pen('sharpie'), { realistic: false });
  mk.penDown();
  assert.equal(mk.segment(0, 0, 0.5, 0)[0].widthMm, 2.0, 'no touch-down blob');
  mk.segment(0, 0, 100000, 0);            // 100 m of line
  assert.equal(mk.ink, 1, 'no depletion');
  mk.realistic = true;
  mk.segment(0, 0, 1000, 0);
  assert.ok(mk.ink < 1, 'realism resumes when toggled back on');
});

test('a half-empty pen with realism off draws at full strength', () => {
  const ps = new PenSim(pen('fine05'), { ink: 0.05, realistic: false, rng: () => 0 });
  ps.penDown();
  const ops = ps.segment(0, 0, 10, 0);
  assert.equal(ops.length, 1, 'no low-ink skips');
  assert.equal(ops[0].alpha, 1, 'no low-ink fade');
  assert.equal(ps.ink, 0.05, 'level frozen');
});

test('brush swell survives non-realistic mode (character, not a flaw)', () => {
  const ps = new PenSim(pen('brush'), { realistic: false });
  ps.penDown();
  const widths = [];
  for (let x = 0; x < 200; x += 5) widths.push(ps.segment(x, 0, x + 5, 0)[0].widthMm);
  assert.ok(new Set(widths.map(w => w.toFixed(3))).size > 3, 'width still varies');
});
