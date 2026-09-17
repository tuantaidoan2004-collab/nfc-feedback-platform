/**
 * Small hand-written confetti burst (Tài chose no dependency, 2026-09-17). Draws on a temporary full-screen canvas
 * that ignores pointer input and removes itself when the pieces have fallen. The canvas goes inside `host`, so its
 * z-index is compared with the thank-you popup in the same stacking context. Callers skip it for reduced motion.
 */
const COLORS = ['#214034', '#C88A1E', '#EFF2E8', '#4285F4', '#EA4335', '#FBBC05', '#34A853'];
const DURATION_MS = 1800;

type Piece = { x: number; y: number; vx: number; vy: number; size: number; spin: number; angle: number; color: string };

export function burstConfetti(host: HTMLElement, count = 140): void {
  const doc = host.ownerDocument, win = doc.defaultView;
  if (!win) return;
  const canvas = doc.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  const scale = win.devicePixelRatio || 1;
  const width = win.innerWidth, height = win.innerHeight;
  canvas.width = width * scale; canvas.height = height * scale;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.confetti = '';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: `${width}px`, height: `${height}px`, pointerEvents: 'none', zIndex: '45' });
  host.appendChild(canvas);
  context.scale(scale, scale);

  // Two bursts from the lower corners, aimed up and toward the middle.
  const pieces: Piece[] = Array.from({ length: count }, (_, index) => {
    const left = index % 2 === 0;
    const angle = (left ? -60 : -120) * Math.PI / 180 + (Math.random() - 0.5) * 0.7;
    const speed = 9 + Math.random() * 8;
    return { x: left ? 0 : width, y: height * 0.85, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6, spin: (Math.random() - 0.5) * 0.4, angle: Math.random() * Math.PI,
      color: COLORS[index % COLORS.length] };
  });

  const start = win.performance.now();
  const frame = (now: number) => {
    const elapsed = now - start;
    context.clearRect(0, 0, width, height);
    const fade = Math.max(0, 1 - Math.max(0, elapsed - DURATION_MS * 0.6) / (DURATION_MS * 0.4));
    for (const piece of pieces) {
      piece.vy += 0.32; piece.vx *= 0.985; piece.x += piece.vx; piece.y += piece.vy; piece.angle += piece.spin;
      context.save();
      context.globalAlpha = fade;
      context.translate(piece.x, piece.y); context.rotate(piece.angle);
      context.fillStyle = piece.color;
      context.fillRect(-piece.size / 2, -piece.size / 3, piece.size, piece.size * 0.66);
      context.restore();
    }
    if (elapsed < DURATION_MS) win.requestAnimationFrame(frame);
    else canvas.remove();
  };
  win.requestAnimationFrame(frame);
}
