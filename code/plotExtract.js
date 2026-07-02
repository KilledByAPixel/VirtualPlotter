'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape';
const LAYER_COLORS = [
  '#000000', '#c22d2d', '#1f8a3e', '#1f5cd4', '#c97b00',
  '#7a2cc4', '#0aa3a3', '#8a3a8a', '#3a8a3a',
];

function cssColorToHex(s) {
  if (!s) return null;
  if (s[0] === '#') {
    if (s.length === 4) return '#' + s[1]+s[1] + s[2]+s[2] + s[3]+s[3];
    if (s.length === 7) return s.toLowerCase();
    return null;
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  const h = n => (+n).toString(16).padStart(2, '0');
  return '#' + h(m[1]) + h(m[2]) + h(m[3]);
}

function parseLengthMm(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(-?[\d.eE+-]+)\s*([a-z%]*)$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  const u = (m[2] || 'px').toLowerCase();
  const conv = { mm:1, cm:10, m:1000, in:25.4, pt:25.4/72, pc:25.4/6, px:25.4/96 };
  return n * (conv[u] ?? 25.4/96);
}

export function extractStrokes(svgText) {
  if (!/<svg\b[^>]*\bxmlns\s*=/i.test(svgText)) {
    svgText = svgText.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const parsed = doc.querySelector('svg');
  if (!parsed || doc.querySelector('parsererror')) throw new Error('Failed to parse SVG');

  // Host offscreen but RENDERED (not display:none) so getScreenCTM /
  // getTotalLength / getComputedStyle return real geometry.
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed; left:-99999px; top:0; width:3000px; height:3000px; overflow:hidden;';
  const svg = document.importNode(parsed, true);
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    return extractFromLiveSvg(svg, parsed);
  } finally {
    host.remove();
  }
}

function extractFromLiveSvg(svg, srcForAttrs) {
  // ---- dimensions: viewBox -> width/height -> bbox fallbacks ----
  const vb = (srcForAttrs.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(parseFloat);
  let vbX = 0, vbY = 0, vbW = 0, vbH = 0;
  if (vb.length === 4 && vb.every(v => isFinite(v))) [vbX, vbY, vbW, vbH] = vb;

  let widthMm = parseLengthMm(srcForAttrs.getAttribute('width'));
  let heightMm = parseLengthMm(srcForAttrs.getAttribute('height'));

  if ((!vbW || !vbH) && widthMm != null && heightMm != null) {
    vbX = 0; vbY = 0; vbW = widthMm * 96 / 25.4; vbH = heightMm * 96 / 25.4;
  }
  if (!vbW || !vbH) {
    try {
      const bbox = svg.getBBox();
      if (bbox && isFinite(bbox.width) && bbox.width > 0 && bbox.height > 0) {
        vbX = bbox.x; vbY = bbox.y; vbW = bbox.width; vbH = bbox.height;
      }
    } catch { /* getBBox can fail for non-rendered content */ }
  }
  if (!vbW || !vbH) { vbX = 0; vbY = 0; vbW = 100; vbH = 100; }
  if (widthMm == null) widthMm = vbW * 25.4 / 96;
  if (heightMm == null) heightMm = vbH * 25.4 / 96;
  if (!svg.hasAttribute('viewBox')) svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);

  const mmPerUnitX = widthMm / vbW;
  const mmPerUnitY = heightMm / vbH;

  const strokes = [];
  const strokeLayers = [];
  const layerInfo = [];

  const findLayer = (el) => {
    let n = el.parentNode;
    while (n && n.nodeType === 1 && n !== svg) {
      if (n.tagName && n.tagName.toLowerCase() === 'g') {
        const mode = n.getAttribute('inkscape:groupmode')
          || n.getAttributeNS(INKSCAPE_NS, 'groupmode');
        if (mode === 'layer') {
          return n.getAttribute('inkscape:label') || n.getAttributeNS(INKSCAPE_NS, 'label')
            || n.getAttribute('id') || `layer ${layerInfo.length + 1}`;
        }
      }
      n = n.parentNode;
    }
    return null;
  };
  const layerIdxFor = (el, strokeColor) => {
    const name = findLayer(el) ?? '(unlayered)';
    let idx = layerInfo.findIndex(l => l.name === name);
    if (idx < 0) {
      idx = layerInfo.length;
      layerInfo.push({
        name,
        color: strokeColor ?? LAYER_COLORS[idx % LAYER_COLORS.length],
        layered: name !== '(unlayered)',
      });
    }
    return idx;
  };

  const rootScreen = svg.getScreenCTM();
  const rootInv = rootScreen ? rootScreen.inverse() : null;
  const ctmCache = new WeakMap();
  const getCTM = (el) => {
    if (!rootInv) return null;
    if (!el.hasAttribute('transform')) {
      const parent = el.parentNode;
      if (parent && typeof parent.getScreenCTM === 'function') {
        if (!ctmCache.has(parent)) {
          const ps = parent.getScreenCTM();
          ctmCache.set(parent, ps ? rootInv.multiply(ps) : null);
        }
        return ctmCache.get(parent);
      }
    }
    const s = el.getScreenCTM();
    return s ? rootInv.multiply(s) : null;
  };

  const mapPt = (ctm, ux, uy) => [
    (ctm.a*ux + ctm.c*uy + ctm.e) * mmPerUnitX,
    (ctm.b*ux + ctm.d*uy + ctm.f) * mmPerUnitY,
  ];

  const avgScale = (mmPerUnitX + mmPerUnitY) / 2;

  const extractAnalytic = (el, tag, ctm) => {
    const num = a => parseFloat(el.getAttribute(a)) || 0;
    let local = null;
    if (tag === 'circle') {
      const cx = num('cx'), cy = num('cy'), r = num('r'); if (r <= 0) return null;
      const n = Math.max(8, Math.min(64, Math.ceil(2*Math.PI*r*avgScale))); local = [];
      for (let i=0;i<=n;i++){const t=i/n*2*Math.PI; local.push([cx+r*Math.cos(t),cy+r*Math.sin(t)]);}
    } else if (tag === 'ellipse') {
      const cx=num('cx'),cy=num('cy'),rx=num('rx'),ry=num('ry'); if(rx<=0||ry<=0) return null;
      const n=Math.max(8,Math.min(64,Math.ceil(2*Math.PI*Math.max(rx,ry)*avgScale))); local=[];
      for (let i=0;i<=n;i++){const t=i/n*2*Math.PI; local.push([cx+rx*Math.cos(t),cy+ry*Math.sin(t)]);}
    } else if (tag === 'line') {
      local = [[num('x1'),num('y1')],[num('x2'),num('y2')]];
    } else if (tag === 'rect') {
      const x=num('x'),y=num('y'),w=num('width'),h=num('height'); if(w<=0||h<=0) return null;
      local = [[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
    } else if (tag === 'polyline' || tag === 'polygon') {
      const ps=(el.getAttribute('points')||'').match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
      if (!ps || ps.length < 4) return null; local = [];
      for (let i=0;i+1<ps.length;i+=2) local.push([parseFloat(ps[i]),parseFloat(ps[i+1])]);
      if (tag==='polygon' && local.length) local.push(local[0].slice());
    } else return null;
    return local.map(([ux,uy]) => mapPt(ctm, ux, uy));
  };

  const samplePathLike = (el, ctm, len) => {
    const step = Math.max(0.5, len/2000); const pts = [];
    for (let l=0;l<=len;l+=step){const p=el.getPointAtLength(l); pts.push(mapPt(ctm,p.x,p.y));}
    const pe=el.getPointAtLength(len); pts.push(mapPt(ctm,pe.x,pe.y));
    return pts;
  };

  const extractPath = (pathEl, ctm, layerIdx) => {
    const d = pathEl.getAttribute('d') || '';
    const chunks = d.match(/[Mm][^Mm]*/g) || [];
    if (!chunks.length) return;
    const parent = pathEl.parentNode || svg;
    const numRe = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
    let cx=0, cy=0, sx=0, sy=0;
    for (let i=0;i<chunks.length;i++){
      const sub=chunks[i]; const isRel=sub[0]==='m';
      numRe.lastIndex=1; const m1=numRe.exec(sub), m2=numRe.exec(sub);
      if (!m1||!m2) continue;
      const lx=parseFloat(m1[0]), ly=parseFloat(m2[0]);
      let ax, ay;
      if (i===0){ax=lx;ay=ly;} else if(isRel){ax=cx+lx;ay=cy+ly;} else {ax=lx;ay=ly;}
      const tail=sub.slice(numRe.lastIndex);
      const fixedD=`${sub[0]}${ax},${ay}${tail}`;
      const tmp=document.createElementNS(SVG_NS,'path');
      tmp.setAttribute('d',fixedD); parent.appendChild(tmp);
      let len=0; try{len=tmp.getTotalLength();}catch{}
      if (len>0){
        const pts=samplePathLike(tmp,ctm,len);
        if (pts.length>=2){strokes.push(pts);strokeLayers.push(layerIdx);}
        const pe=tmp.getPointAtLength(len); cx=pe.x; cy=pe.y;
      } else {cx=ax;cy=ay;}
      sx=ax;sy=ay; if(/[Zz]/.test(sub)){cx=sx;cy=sy;}
      tmp.remove();
    }
  };

  const els = Array.from(svg.querySelectorAll(
    'path, line, polyline, polygon, rect, circle, ellipse'));
  for (const el of els) {
    if (el.closest('defs, clipPath, mask, marker, symbol, pattern')) continue;
    if (typeof el.getScreenCTM !== 'function') continue;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (cs.stroke === 'none' || cs.stroke === '') continue;
    if (parseFloat(cs.strokeOpacity) === 0) continue;
    if (parseFloat(cs.opacity) === 0) continue;
    const ctm = getCTM(el); if (!ctm) continue;
    const layerIdx = layerIdxFor(el, cssColorToHex(cs.stroke));
    const tag = el.tagName.toLowerCase();
    if (tag === 'path') extractPath(el, ctm, layerIdx);
    else {
      const pts = extractAnalytic(el, tag, ctm);
      if (pts && pts.length >= 2) { strokes.push(pts); strokeLayers.push(layerIdx); }
    }
  }

  // ---- normalize to artwork bbox origin (0,0) ----
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const [x, y] of s) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = widthMm; maxY = heightMm; }
  for (const s of strokes) for (const p of s) { p[0] -= minX; p[1] -= minY; }

  return {
    strokes, strokeLayers, layerInfo,
    widthMm: Math.max(0.001, maxX - minX),
    heightMm: Math.max(0.001, maxY - minY),
  };
}
