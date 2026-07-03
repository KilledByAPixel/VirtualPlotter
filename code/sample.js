// A tiny two-layer SVG that seeds the Recent list on first visit, so there's
// something to plot without hunting for an SVG file.
export const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="100mm" height="80mm" viewBox="0 0 100 80">
  <g inkscape:groupmode="layer" inkscape:label="Layer 1">
    <path d="M10,10 L90,10 L90,70 L10,70 Z" fill="none" stroke="#000000" stroke-width="0.5"/>
    <path d="M10,10 L90,70" fill="none" stroke="#000000" stroke-width="0.5"/>
  </g>
  <g inkscape:groupmode="layer" inkscape:label="Layer 2">
    <circle cx="50" cy="40" r="20" fill="none" stroke="#c22d2d" stroke-width="0.5"/>
    <rect x="40" y="30" width="20" height="20" fill="none" stroke="#c22d2d" stroke-width="0.5"/>
  </g>
</svg>
`;
