'use strict';
// Data-only definitions of the pens in the caddy and the papers in the stack.
// capacityM is meters of line a fresh pen can draw (penSim scales spend by tip
// width). No logic here — penSim interprets the behavior fields.

export const PENS = [
  { id: 'fine03',  name: 'Fineliner',  style: 'fineliner', tip: 0.3, color: '#1a1a1a', capacityM: 150 },
  { id: 'fine05',  name: 'Fineliner',  style: 'fineliner', tip: 0.5, color: '#1a1a1a', capacityM: 150 },
  { id: 'fine05r', name: 'Fineliner',  style: 'fineliner', tip: 0.5, color: '#c22d2d', capacityM: 150 },
  { id: 'fine05b', name: 'Fineliner',  style: 'fineliner', tip: 0.5, color: '#2b4fc2', capacityM: 150 },
  { id: 'sharpie', name: 'Marker',     style: 'marker',    tip: 2.0, color: '#111111', capacityM: 400 },
  { id: 'gel',     name: 'Gel',        style: 'gel',       tip: 0.7, color: '#f2f2f2', capacityM: 120, opaque: true },
  { id: 'silver',  name: 'Metallic',   style: 'metallic',  tip: 1.0, color: '#b8bcc4', capacityM: 100, opaque: true, sheen: true },
  { id: 'gold',    name: 'Metallic',   style: 'metallic',  tip: 1.0, color: '#c9a83c', capacityM: 100, opaque: true, sheen: true },
  { id: 'brush',   name: 'Brush',      style: 'brush',     tip: 1.0, tipMin: 0.5, tipMax: 2.5, color: '#1a1a1a', capacityM: 250 },
  { id: 'ball',    name: 'Ballpoint',  style: 'ballpoint', tip: 0.5, color: '#20336e', capacityM: 500, dryStartMm: 3, skipChance: 0.03 },
  // A rainbow set of markers; rack 1 = the back row of the caddy.
  { id: 'mkred',    name: 'Marker', style: 'marker', tip: 2.0, color: '#d92b2b', capacityM: 400, rack: 1 },
  { id: 'mkorange', name: 'Marker', style: 'marker', tip: 2.0, color: '#e07118', capacityM: 400, rack: 1 },
  { id: 'mkyellow', name: 'Marker', style: 'marker', tip: 2.0, color: '#e3b81f', capacityM: 400, rack: 1 },
  { id: 'mkgreen',  name: 'Marker', style: 'marker', tip: 2.0, color: '#2f9e44', capacityM: 400, rack: 1 },
  { id: 'mkcyan',   name: 'Marker', style: 'marker', tip: 2.0, color: '#17a2b8', capacityM: 400, rack: 1 },
  { id: 'mkblue',   name: 'Marker', style: 'marker', tip: 2.0, color: '#2b52d9', capacityM: 400, rack: 1 },
  { id: 'mkpurple', name: 'Marker', style: 'marker', tip: 2.0, color: '#7a2cc4', capacityM: 400, rack: 1 },
  { id: 'mkpink',   name: 'Marker', style: 'marker', tip: 2.0, color: '#d94bb0', capacityM: 400, rack: 1 },
];
export const DEFAULT_PEN = 'fine05';

export const PAPERS = [
  { id: 'bristol',    name: 'Bristol',    color: '#ffffff', grain: 0,    bleed: 0 },
  { id: 'watercolor', name: 'Watercolor', color: '#f6f1e4', grain: 0.5,  bleed: 0 },
  { id: 'cheap',      name: 'Cheap copy', color: '#f0f0ea', grain: 0.15, bleed: 0.5 },
  { id: 'black',      name: 'Black card', color: '#181a1c', grain: 0,    bleed: 0 },
];
export const DEFAULT_PAPER = 'bristol';
