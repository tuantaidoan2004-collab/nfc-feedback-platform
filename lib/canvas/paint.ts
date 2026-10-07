import type { Background, Fill, Shadow } from './doc';

/** A fill as CSS: a colour, or a gradient written from its stops. Inputs are already checked (validate.ts), so no escaping is needed. */
export function paint(fill: Fill): string {
  if (typeof fill === 'string') return fill;
  const stops = fill.stops.map(([color, at]) => `${color} ${at}%`).join(', ');
  return fill.kind === 'linear' ? `linear-gradient(${fill.angle}deg, ${stops})` : `radial-gradient(ellipse at ${fill.x}% ${fill.y}%, ${stops})`;
}
/** The fill's first colour: where only one colour can be drawn (an SVG stroke). */
export const firstColor = (fill: Fill) => typeof fill === 'string' ? fill : fill.stops[0][0];
/** A shadow in design units (`--u`, components/canvas/canvas.css). */
export const shadowCss = (s: Shadow) => `calc(${s.x} * var(--u)) calc(${s.y} * var(--u)) calc(${s.blur} * var(--u)) ${s.color}`;
export const backgroundCss = (bg: Background | undefined) => bg?.fill ? paint(bg.fill) : undefined;
