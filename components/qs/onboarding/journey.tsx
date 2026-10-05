'use client';
/**
 * Đường cong và các nút emoji ở chân pha trời xanh (mẫu Jitter, rieng/kich-ban.md mục 4). Nút của bước hiện tại to, ở giữa,
 * viền trắng, lấp lánh; bước trước nhỏ bên trái, bước sau nhỏ bên phải. Đổi bước thì cả dải trượt và đường cong uốn theo.
 * Vị trí tính mỗi khung hình từ cùng một hàm, nên nút luôn nằm đúng trên đường.
 */
import { useEffect, useRef } from 'react';
import styles from './sky.module.css';

const SPARKS = Array.from({ length: 16 }, (_, i) => {
  const angle = (i * 137.5) * Math.PI / 180, radius = 0.62 + ((i * 53) % 40) / 100;
  // Rounded, so the server's HTML and the browser's first render agree to the character.
  return { x: Math.round(Math.cos(angle) * radius * 120), y: Math.round(Math.sin(angle) * radius * 90), delay: `${((i * 37) % 260) * 10}ms` };
});

export default function Journey({ emojis, current }: { emojis: string[]; current: number }) {
  const box = useRef<HTMLDivElement>(null), path = useRef<SVGPathElement>(null), nodes = useRef<(HTMLDivElement | null)[]>([]), sparks = useRef<HTMLDivElement>(null);
  const target = useRef(current);
  useEffect(() => { target.current = current; }, [current]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    let w = el.clientWidth, h = el.clientHeight, at = target.current, frame = 0;
    const observer = new ResizeObserver(() => { w = el.clientWidth; h = el.clientHeight; }); observer.observe(el);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      at += (target.current - at) * (reduce ? 1 : 0.075);
      const small = w < 720, amp = Math.min(62, h * 0.2), phase = at * 1.15 + now / 9000;
      const y = (x: number) => h * 0.5 + amp * Math.sin((x / w) * Math.PI * 1.7 + phase);
      let d = '';
      for (let x = -20; x <= w + 20; x += 12) d += `${x === -20 ? 'M' : 'L'}${x.toFixed(1)},${y(x).toFixed(1)}`;
      path.current?.setAttribute('d', d);
      const spacing = Math.max(150, Math.min(640, w * 0.32)), big = small ? 104 : 150, little = small ? 52 : 74;
      emojis.forEach((_, i) => {
        const node = nodes.current[i]; if (!node) return;
        const x = w / 2 + (i - at) * spacing, near = Math.max(0, 1 - Math.abs(i - at)), size = little + (big - little) * near;
        node.style.width = node.style.height = `${size}px`;
        node.style.transform = `translate(${x - size / 2}px, ${y(x) - size / 2}px)`;
        node.style.opacity = String(Math.max(0, Math.min(1, 1.6 - Math.abs(i - at) * 0.55)));
        (node.firstElementChild as HTMLElement).style.fontSize = `${size * 0.32}px`;
        node.dataset.current = String(Math.round(at) === i);
      });
      if (sparks.current) { const x = w / 2 + (target.current - at) * spacing; sparks.current.style.transform = `translate(${x}px, ${y(x)}px)`; }
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [emojis]);
  return <div className={styles.journey} ref={box} aria-hidden="true">
    <svg><defs><linearGradient id="qs-line" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".18" stopColor="#fff" stopOpacity=".95" />
      <stop offset=".82" stopColor="#fff" stopOpacity=".95" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
      <path ref={path} /></svg>
    <div ref={sparks} style={{ position: 'absolute', left: 0, top: 0 }}>{SPARKS.map((s, i) =>
      <span key={i} className={styles.spark} style={{ left: s.x, top: s.y, animationDelay: s.delay }} />)}</div>
    {emojis.map((emoji, i) => <div key={i} ref={el => { nodes.current[i] = el; }} className={styles.node}><span>{emoji}</span></div>)}
  </div>;
}
