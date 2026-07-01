'use strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
  const clearInk = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
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

  function inkSegment(ax, ay, bx, by, color) {
    ctx.strokeStyle = color || '#000';
    ctx.lineWidth = Math.max(1, 0.6 * PXMM);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cX(ax), cY(ay));
    ctx.lineTo(cX(bx), cY(by));
    ctx.stroke();
    tex.needsUpdate = true;
  }

  function setPenColor(c) { penBody.material.color.set(c); }
  function resetInk() { clearInk(); tex.needsUpdate = true; }

  function render() {
    const target = penDownTarget ? PEN_DOWN : PEN_UP;
    penY += (target - penY) * 0.25;          // smooth lift/drop
    penGroup.position.y = penY + PAPER_TOP_Y; // tip rests just above paper
    controls.update();
    renderer.render(scene, camera);
  }

  addEventListener('resize', () => {
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
  });

  return {
    loadArtwork, setPenPose, inkSegment, setPenColor, resetInk, render,
    paperSize: { w: PAPER_W, h: PAPER_H },
  };
}
