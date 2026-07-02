'use strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PAPER_W = 297, PAPER_H = 210;   // A4 landscape, mm
const MARGIN = 12;                    // printable margin, mm
const PXMM = 4;                       // ink-canvas pixels per mm
const PEN_UP = 16, PEN_DOWN = 1.2;    // pen-tip height above paper, mm
const PAPER_TOP_Y = 1.2;              // paper surface height above desk, mm

export function createScene(mount) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  // Vertical gradient backdrop (lighter top -> cooler bottom) so it reads like a
  // lit room instead of a flat fill.
  const makeGradient = (top, bottom) => {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  scene.background = makeGradient('#e9eef3', '#97a4b0');

  // Neutral image-based lighting so metal parts pick up real specular
  // highlights/reflections (metalness reads near-black without an environment).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(
    45, mount.clientWidth / mount.clientHeight, 1, 5000);
  camera.position.set(230, 260, 300);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;   // don't go under the desk
  controls.update();

  // --- free-fly camera ---
  // Default is orbit; the app toggles this on (press F) for a simple FPS-style
  // flycam: click locks the mouse, mouse looks (yaw/pitch only — no roll), and
  // WASD/EQ move at a constant speed with no easing. Only one controller drives
  // the camera at a time.
  const FLY_SPEED = 180;                      // mm/s
  const keyv = { f: 0, b: 0, l: 0, r: 0, u: 0, d: 0 };
  const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
  let fly = null, freeCam = false, freeCamCb = () => {};

  function onFlyKey(e, down) {
    if (!freeCam) return;
    switch (e.code) {
      case 'KeyW': keyv.f = down; break;
      case 'KeyS': keyv.b = down; break;
      case 'KeyA': keyv.l = down; break;
      case 'KeyD': keyv.r = down; break;
      case 'KeyE': case 'Space': keyv.u = down; break;
      case 'KeyQ': case 'ShiftLeft': keyv.d = down; break;
      default: return;
    }
    e.preventDefault();
  }
  addEventListener('keydown', e => onFlyKey(e, 1));
  addEventListener('keyup', e => onFlyKey(e, 0));

  function setFreeCam(on) {
    on = !!on;
    if (on === freeCam) return freeCam;
    freeCam = on;
    if (freeCam) {
      clearHover();                          // flying dismisses any stuck tooltip
      controls.enabled = false;              // hand the camera to the flycam
      for (const k in keyv) keyv[k] = 0;
      fly = new PointerLockControls(camera, renderer.domElement);
      // Esc (or any lost lock) drops back to the orbit camera.
      fly.addEventListener('unlock', () => setFreeCam(false));
      fly.lock();                            // grab the pointer (F keypress is the gesture)
    } else if (fly) {
      fly.unlock();     // release the pointer lock so the cursor comes back
      fly.dispose();
      fly = null;
      // Hand the camera back to orbit around the home pivot (the scene
      // center) — exiting free-cam always restores a sane orbit, from
      // wherever the flight ended.
      controls.target.set(0, 0, 0);
      controls.enabled = true;
      controls.update();
    }
    freeCamCb(freeCam);
    return freeCam;
  }

  // Click-picks pens/paper; a drag (orbiting) is not a click. Hover raises
  // the object slightly and reports it for the tooltip.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pickCb = () => {}, hoverCb = () => {};
  let downXY = null, hovered = null;

  function castAt(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1,
            -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData : null;
  }
  renderer.domElement.addEventListener('pointerdown',
    e => { downXY = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (freeCam || !downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    downXY = null;
    if (moved < 6) { const u = castAt(e); if (u) pickCb(u); }
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (freeCam) return;
    const u = castAt(e);
    const key = u && u.type + u.id;
    if (key !== hovered) {
      hovered = key;
      renderer.domElement.style.cursor = u ? 'pointer' : '';
      hoverCb(u, e.clientX, e.clientY);
    } else if (u) hoverCb(u, e.clientX, e.clientY);
  });
  function clearHover() {
    if (hovered == null) return;
    hovered = null;
    renderer.domElement.style.cursor = '';
    hoverCb(null);
  }
  // Pointer leaving the canvas (onto the panel overlay, out the window, or a
  // touch/pen cancel) must dismiss the tooltip too — pointermove won't fire
  // again to clear it otherwise.
  renderer.domElement.addEventListener('pointerleave', clearHover);
  renderer.domElement.addEventListener('pointercancel', clearHover);

  // --- lights ---
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aa7b0', 0.55));
  const key = new THREE.DirectionalLight('#fff4e6', 1.0);
  key.position.set(180, 320, 160);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera,
    { left: -300, right: 300, top: 300, bottom: -300, near: 10, far: 900 });
  scene.add(key);
  const fill = new THREE.DirectionalLight('#dce8ff', 0.25);
  fill.position.set(-150, 120, -120);
  scene.add(fill);

  // --- desk ---
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(900, 30, 700),
    new THREE.MeshStandardMaterial({ color: '#6f5743', roughness: 0.9 }));
  desk.position.y = -15;
  desk.receiveShadow = true;
  scene.add(desk);

  // --- paper + ink canvas ---
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAPER_W * PXMM);
  canvas.height = Math.round(PAPER_H * PXMM);
  const ctx = canvas.getContext('2d');
  let paperState = { color: '#ffffff', grain: 0, bleed: 0 };
  const clearInk = () => {
    ctx.globalAlpha = 1;
    ctx.fillStyle = paperState.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    bakeGrain();
  };

  // Paper tooth: per-pixel luminance jitter scaled by grain, plus a few soft
  // blotches on heavy-grain papers (watercolor) so it doesn't read as uniform
  // noise. Baked once per clear; ink draws over it.
  function bakeGrain() {
    const g = paperState.grain;
    if (!g) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 34 * g;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    if (g >= 0.3) {
      for (let i = 0; i < 14; i++) {
        const x = Math.random() * canvas.width, y = Math.random() * canvas.height;
        const r = 60 + Math.random() * 200;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(139,130,114,' + (0.05 * g).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(139,130,114,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
      }
    }
  }
  clearInk();
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(PAPER_W, PAPER_H),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  paper.rotation.x = -Math.PI / 2;
  paper.position.y = PAPER_TOP_Y;
  paper.receiveShadow = true;
  scene.add(paper);

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(PAPER_W, PAPER_TOP_Y, PAPER_H),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }));
  // Sink the slab a touch so its top face clears the paper plane (y=PAPER_TOP_Y)
  // and its bottom clears the desk top (y=0) — otherwise both pairs are coplanar
  // and z-fight (the paper texture flickers).
  slab.position.y = PAPER_TOP_Y / 2 - 0.1;
  slab.receiveShadow = true;
  slab.castShadow = true;
  scene.add(slab);

  // --- machine (cube-built AxiDraw) ---
  // A few finishes give specular variety: matte painted body/motors, shiny
  // steel rods/rails, semi-gloss plastic carriage.
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.1 });
  const matMatte = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.08 });
  const matMetal = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.22, metalness: 0.95 });
  const matGloss = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.30, metalness: 0.25 });

  const BEAM_Y = 30;
  const bodyZ = -PAPER_H / 2 - 50;

  const machine = new THREE.Group();
  scene.add(machine);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(PAPER_W + 120, 26, 60), matMatte('#2d3138'));
  body.position.set(0, 13, bodyZ);
  body.castShadow = true;
  machine.add(body);

  // Back X-rail: a steel rod spanning the width that the arm slides along.
  const xRail = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, PAPER_W + 120, 20), matMetal('#c8ccd0'));
  xRail.rotation.z = Math.PI / 2;          // lie along X
  xRail.position.set(0, BEAM_Y, bodyZ);
  xRail.castShadow = true;
  machine.add(xRail);

  {
      const piece = new THREE.Mesh(
        new THREE.BoxGeometry(60, 60, 90), matMatte('#2d3138'));
      piece.position.set(-PAPER_W/2-90, 13, bodyZ);
      piece.castShadow = true;
      machine.add(piece);
  }
  {
      const piece = new THREE.Mesh(
        new THREE.BoxGeometry(20, 60, 60), matMatte('#2d3138'));
      piece.position.set(PAPER_W/2+70, 13, bodyZ);
      piece.castShadow = true;
      machine.add(piece);
  }


  // The Y-axis arm: a beam cantilevered off the back body that reaches forward
  // to the pen. It tracks the pen's X AND its front end always sits at the pen,
  // so the WHOLE beam moves with the head (length is set per frame in
  // setPenPose). Base depth is 1; setPenPose scales it along Z to span from the
  // body out to the pen.
  // The arm is a FIXED-LENGTH beam: its front end stays at the pen and the whole
  // beam slides in X and Z with the head, so the back end simply trails off out
  // the back of the machine (it doesn't shrink — it keeps going past the body).
  // Length is generous so the back always reaches behind the body.
  const ARM_LEN = PAPER_H + 200;
  const armGroup = new THREE.Group();
  machine.add(armGroup);

  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(20, 8, ARM_LEN), matMetal('#c8ccd0'));
  arm.position.set(0, BEAM_Y, -ARM_LEN / 2);   // front end at z=0 (paper center)
  arm.castShadow = true;
  armGroup.add(arm);
  
  // carriage rides along the arm (X with the arm, Z along it); pen lifts within
  const carriage = new THREE.Group();
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(22, 14, 14), matGloss('#4a90d9'));
  block.position.y = BEAM_Y;
  block.castShadow = true;
  carriage.add(block);

  const penGroup = new THREE.Group();   // origin = pen tip
  const penBody = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 36, 16),
    new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.5 }));
  penBody.position.y = 6 + 18;           // base at y=6, top at y=42
  penBody.castShadow = true;
  const penTip = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 6, 16), mat('#111'));
  penTip.rotation.x = Math.PI;           // apex points down
  penTip.position.y = 3;                  // apex at y=0 (the tip)
  penGroup.add(penBody);
  penGroup.add(penTip);
  carriage.add(penGroup);
  machine.add(carriage);

  // The pen in the carriage mirrors the assigned pen: barrel color, girth,
  // metallic finish. swapPen raises the head, changes the pen at the top of
  // the lift (the caddy pen blinks out, the old one returns), and drops back.
  let swap = null;   // {t, half, def, color, done}
  function applyCarriagePen(def, color) {
    const r = def.style === 'marker' ? 4.5 / 2.2 : def.style === 'brush' ? 3.2 / 2.2 : 1;
    penBody.scale.set(r, 1, r);
    penBody.material = def.sheen ? matMetal(color) : matGloss(color);
    penTip.material = penBody.material;
  }
  function setCarriagePen(def, color) { applyCarriagePen(def, color); }
  function swapPen(def, color, done) {
    swap = { t: 0, half: false, def, color, done };
  }
  function cancelSwap() { swap = null; }   // drop an in-flight swap; done() never fires

  // --- pen caddy + paper stack (the diegetic settings) ---
  const pickables = [];            // meshes with .userData = {type, id}
  const penGroups = {};            // id -> {group, barrel, inkBar, homeY}
  const paperSheets = {};          // id -> mesh
  let selectedPaperId = null;

  function buildInventory(pens, papers) {
    const caddy = new THREE.Group();
    caddy.position.set(PAPER_W / 2 + 115, 0, 30);
    scene.add(caddy);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(100, 14, 90), matMatte('#5d4a38'));
    tray.position.y = 7;
    tray.castShadow = tray.receiveShadow = true;
    caddy.add(tray);

    pens.forEach((pen, i) => {
      const col = i % 5, row = (i / 5) | 0;
      const g = new THREE.Group();
      g.position.set(-40 + col * 20, 14, -20 + row * 40);
      const r = pen.style === 'marker' ? 4.5 : pen.style === 'brush' ? 3.2 : 2.4;
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 0.8, 38, 14),
        pen.sheen ? matMetal(pen.color) : matGloss(pen.color));
      barrel.position.y = 19;
      barrel.castShadow = true;
      barrel.userData = { type: 'pen', id: pen.id };
      // ink gauge: a pale ring that shrinks as the pen empties
      const inkBar = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.4, r + 0.4, 10, 14),
        matGloss('#e8e4da'));
      inkBar.position.y = 10;
      g.add(barrel); g.add(inkBar);
      caddy.add(g);
      pickables.push(barrel);
      penGroups[pen.id] = { group: g, barrel, inkBar, homeY: g.position.y };
    });

    const stack = new THREE.Group();
    stack.position.set(-PAPER_W / 2 - 130, 0, 40);
    scene.add(stack);
    papers.forEach((p, i) => {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(150, 2, 110),
        matMatte(p.color));
      sheet.rotation.y = (i - papers.length / 2) * 0.16;
      sheet.position.set((i % 2 ? 10 : -10), 1 + i * 3.2, (i - papers.length / 2) * 14);
      sheet.castShadow = sheet.receiveShadow = true;
      sheet.userData = { type: 'paper', id: p.id };
      stack.add(sheet);
      pickables.push(sheet);
      paperSheets[p.id] = sheet;
    });
  }

  function setPenLevel(id, frac) {
    const e = penGroups[id]; if (!e) return;
    e.inkBar.scale.y = Math.max(0.04, frac);
    e.inkBar.position.y = 5 + 5 * Math.max(0.04, frac);
  }
  function setPenInCaddy(id, visible) {
    const e = penGroups[id]; if (e) e.group.visible = visible;
  }
  function setPaperSelected(id) {
    if (selectedPaperId && paperSheets[selectedPaperId])
      paperSheets[selectedPaperId].position.y -= 6;
    selectedPaperId = id;
    if (paperSheets[id]) paperSheets[id].position.y += 6;
  }

  let selectedPenId3d = null;
  function setPenSelected(id) {
    const prev = penGroups[selectedPenId3d];
    if (prev) prev.group.position.y = prev.homeY;
    selectedPenId3d = id;
    const cur = penGroups[id];
    if (cur) cur.group.position.y = cur.homeY + 6;
  }

  // --- artwork-mm -> world / canvas mapping ---
  let fit = { scale: 1, originX: PAPER_W / 2, originY: PAPER_H / 2 };
  function loadArtwork(artW, artH) {
    const s = Math.min((PAPER_W - 2 * MARGIN) / artW,
                       (PAPER_H - 2 * MARGIN) / artH);
    const fw = artW * s, fh = artH * s;
    fit = { scale: s, originX: (PAPER_W - fw) / 2, originY: (PAPER_H - fh) / 2 };
    clearInk();
    tex.needsUpdate = true;
  }
  const worldX = (ax) => -PAPER_W / 2 + fit.originX + ax * fit.scale;
  const worldZ = (ay) => -PAPER_H / 2 + fit.originY + ay * fit.scale;
  const cX = (ax) => (fit.originX + ax * fit.scale) * PXMM;
  const cY = (ay) => (fit.originY + ay * fit.scale) * PXMM;

  let penDownTarget = false;
  let penY = PEN_UP;
  function setPenPose(ax, ay, penDown) {
    const wx = worldX(ax), wz = worldZ(ay);
    // Fixed-length arm: pin its front end to the pen and slide it in X/Z, so the
    // back end trails off out the back of the machine.
    arm.position.set(wx, BEAM_Y, wz - ARM_LEN / 2);
    carriage.position.x = wx;   // pen carriage rides at the front end of the arm
    carriage.position.z = wz;
    penDownTarget = !!penDown;
  }

  // Paper-aware stroke renderer. grain roughens alpha per op (visual only, so
  // Math.random is fine here); bleed adds a faint wide halo pass; sheen adds a
  // bright core fleck so metallic ink glints.
  function drawOp(op) {
    const { ax, ay, bx, by, color, widthMm, alpha = 1, sheen } = op;
    let a = alpha;
    if (paperState.grain) a *= 1 - paperState.grain * 0.7 * Math.random();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color || '#000';
    const seg = () => {
      ctx.beginPath();
      ctx.moveTo(cX(ax), cY(ay));
      ctx.lineTo(cX(bx), cY(by));
      ctx.stroke();
    };
    if (paperState.bleed) {
      ctx.globalAlpha = a * 0.25;
      ctx.lineWidth = Math.max(1, (widthMm + paperState.bleed) * PXMM);
      seg();
    }
    ctx.globalAlpha = a;
    ctx.lineWidth = Math.max(1, widthMm * PXMM);
    seg();
    if (sheen) {
      ctx.globalAlpha = a * 0.3 * Math.random();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, widthMm * 0.35 * PXMM);
      seg();
    }
    ctx.globalAlpha = 1;
    tex.needsUpdate = true;
  }

  function resetInk() { clearInk(); tex.needsUpdate = true; }

  function setPaper(p) {
    paperState = { color: p.color || '#ffffff', grain: p.grain || 0, bleed: p.bleed || 0 };
    slab.material.color.set(paperState.color);  // paper edges match the sheet
    clearInk();
    tex.needsUpdate = true;
  }

  function render(dtMs = 16) {
    if (swap) {
      swap.t += dtMs / 600;                       // 0..1 over 0.6s
      const up = Math.sin(Math.min(swap.t, 1) * Math.PI) * 50;
      penGroup.position.y = PEN_UP + PAPER_TOP_Y + up;
      if (swap.t >= 0.5 && !swap.half) {
        swap.half = true;
        applyCarriagePen(swap.def, swap.color);
      }
      if (swap.t >= 1) { const d = swap.done; swap = null; d && d(); }
      // skip normal pen easing while swapping
    } else {
      const target = penDownTarget ? PEN_DOWN : PEN_UP;
      penY += (target - penY) * 0.25;          // smooth lift/drop
      penGroup.position.y = penY + PAPER_TOP_Y; // tip rests just above paper
    }
    if (freeCam && fly) {
      // Constant-speed WASD flight in the look direction; strafe/vertical stay
      // level. No easing — the camera moves only while a key is held.
      const d = FLY_SPEED * Math.min(dtMs, 100) / 1000;
      camera.getWorldDirection(_fwd);
      _right.crossVectors(_fwd, camera.up).normalize();
      if (keyv.f) camera.position.addScaledVector(_fwd, d);
      if (keyv.b) camera.position.addScaledVector(_fwd, -d);
      if (keyv.r) camera.position.addScaledVector(_right, d);
      if (keyv.l) camera.position.addScaledVector(_right, -d);
      camera.position.y += (keyv.u - keyv.d) * d;
    } else {
      controls.update();
    }
    renderer.render(scene, camera);
  }

  addEventListener('resize', () => {
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
  });

  return {
    loadArtwork, setPenPose, drawOp, setPaper, resetInk, render,
    setFreeCam, toggleFreeCam: () => setFreeCam(!freeCam),
    onFreeCam: (fn) => { freeCamCb = fn || (() => {}); },
    paperSize: { w: PAPER_W, h: PAPER_H },
    buildInventory, onPick: f => pickCb = f, onHover: f => hoverCb = f,
    setPenLevel, setPenInCaddy, setPaperSelected, setPenSelected, setCarriagePen, swapPen, cancelSwap,
  };
}
