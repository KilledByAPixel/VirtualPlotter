import test from 'node:test';
import assert from 'node:assert/strict';
import { PENS, PAPERS, DEFAULT_PEN, DEFAULT_PAPER } from './inventory.js';

test('pen definitions are unique and complete', () => {
  const ids = new Set();
  for (const p of PENS) {
    assert.ok(!ids.has(p.id), `duplicate pen id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.name && p.style, `${p.id} missing name/style`);
    assert.ok(p.tip > 0, `${p.id} bad tip`);
    assert.ok(p.capacityM > 0, `${p.id} bad capacity`);
    assert.match(p.color, /^#[0-9a-f]{6}$/i, `${p.id} bad color`);
    if (p.style === 'brush')
      assert.ok(p.tipMin > 0 && p.tipMax > p.tipMin, 'brush needs tipMin/tipMax');
  }
  assert.ok(PENS.some(p => p.id === DEFAULT_PEN), 'DEFAULT_PEN exists');
});

test('paper definitions are unique and complete', () => {
  const ids = new Set();
  for (const p of PAPERS) {
    assert.ok(!ids.has(p.id), `duplicate paper id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.name, `${p.id} missing name`);
    assert.match(p.color, /^#[0-9a-f]{6}$/i, `${p.id} bad color`);
  }
  assert.ok(PAPERS.some(p => p.id === DEFAULT_PAPER), 'DEFAULT_PAPER exists');
});

test('pen names are generic: no trademarks or color words', () => {
  for (const p of PENS)
    assert.ok(!/sharpie|red|blue|white|silver|gold/i.test(p.name),
      `${p.id} name "${p.name}" not generic`);
});
