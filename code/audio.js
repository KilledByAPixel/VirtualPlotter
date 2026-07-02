'use strict';
// Web Audio "stepper motor" sound effects for the plotter, AxiDraw-style.
//
// ONE continuous motor voice drives the whole carriage motion: its pitch tracks
// the overall feed speed, and the Y-axis component nudges the pitch a little so
// the tone weaves as the head changes direction — which is roughly how a real
// AxiDraw sounds (one whine that shifts as it draws). It's deliberately quiet.
//
// The pen lift/drop is a SEPARATE, louder servo chirp.
//
// Everything is gated by an `enabled` flag; the caller mutes it above 1x speed
// (faster than realtime sounds awful, per design).

// --- tuning knobs ---
const MOTOR_BASE = 120;   // Hz the motor whine starts at once it's moving
const MOTOR_SCALE = 3.0;  // + Hz per mm/s of overall feed speed
const Y_TWEAK = 1.4;      // + Hz per mm/s of Y-axis speed (the directional wobble)
const MOTOR_MAX_V = 260;  // mm/s clamp for the mappings above
const MOTOR_VOL = 0.10;   // quiet — the motor is background
const SERVO_VOL = 0.05;   // pen servo — a soft low thunk, a touch above the motor

export function createAudio() {
  let ctx = null;
  let master = null;
  let motor = null;          // { osc, filt, gain }
  let enabled = false;       // effective gate: realtime AND not user-muted
  let speedOn = false;       // realtime (1x) gate, set by setEnabled
  let muted = false;         // user mute toggle, set by setMuted

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    // Single motor voice: sawtooth -> resonant bandpass -> gain. The bandpass
    // tracks the pitch (with some Q) to give it a focused, servo-ish whine
    // rather than a flat buzz.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.Q.value = 5;
    filt.frequency.value = MOTOR_BASE;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filt).connect(gain).connect(master);
    osc.start();
    motor = { osc, filt, gain };
  }

  // Call from a user gesture (e.g. the Play button) so the browser permits audio.
  function resume() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function refresh() {
    enabled = speedOn && !muted;
    if (!enabled) silence();
  }
  function setEnabled(on) { speedOn = !!on; refresh(); }   // realtime gate
  function setMuted(on) { muted = !!on; refresh(); }        // user mute toggle

  // vx, vy: absolute axis speeds in mm/s for the current frame.
  function updateMotors(vx, vy) {
    if (!enabled || !ctx) return;
    const speed = Math.hypot(vx, vy);
    const moving = speed > 0.5;                      // mm/s deadband
    const freq = MOTOR_BASE
      + Math.min(speed, MOTOR_MAX_V) * MOTOR_SCALE
      + Math.min(vy, MOTOR_MAX_V) * Y_TWEAK;
    const t = ctx.currentTime;
    motor.osc.frequency.setTargetAtTime(freq, t, 0.015);
    motor.filt.frequency.setTargetAtTime(freq, t, 0.02);
    motor.gain.gain.setTargetAtTime(moving ? MOTOR_VOL : 0, t, 0.02);
  }

  function silence() {
    if (!ctx) return;
    motor.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
  }

  // Short servo chirp when the pen drops (down=true) or lifts (down=false).
  function penMove(down) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const g = ctx.createGain();
    const f0 = down ? 240 : 300;
    const f1 = down ? 150 : 220;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(SERVO_VOL, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  return { resume, setEnabled, setMuted, updateMotors, penMove, silence };
}
