'use client';
/**
 * Orb — trang chủ của giao diện chính (kịch bản mục 6). Một shader WebGL2 vẽ các "giọt" (metaball) dính nhau như jelly:
 * Orb chính trôi kiểu logo DVD; bấm vào nó hoặc Space thì tách ra các orb nhỏ xếp như cánh quạt, mỗi orb là một tab
 * (chỉ icon, trỏ vào mới hiện chữ). Trong các tab, Orb núp ở góc trên bên trái và tách dọc theo mép trái.
 * Màu: trắng ngọc pha xanh dương nhạt; `mood` 'alert' ngả đỏ, 'good' ngả xanh lá; giao diện tối thì phát sáng.
 * `pulse` tăng lên là Orb nảy (khách bấm nút trên trang của quán); `strong` nảy mạnh hơn (bấm Google).
 * Vị trí các orb tính bằng JS mỗi khung hình; shader chỉ vẽ. Nút bấm là DOM thật đè lên, nên bàn phím và trình đọc màn hình dùng được.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './orb.module.css';

export type OrbTab = { key: string; label: string; href: string; icon: ReactNode };
type Mood = 'calm' | 'alert' | 'good';
type Props = { tabs: OrbTab[]; mode: 'home' | 'dock'; mood?: Mood; pulse?: { n: number; strong: boolean }; current?: string;
  onNavigate: (tab: OrbTab) => void; dark?: boolean };

const MAX = 9;
const VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position=vec4(aPos,0.,1.); }`;
const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uDpr; uniform float uTime; uniform int uCount;
uniform vec4 uB[${MAX}]; uniform vec2 uD[${MAX}];
uniform vec3 uTint; uniform float uTintAmt; uniform float uDark; uniform float uHover[${MAX}];
out vec4 o;
float blob(int i, vec2 p){
  vec4 b=uB[i]; if(b.z<0.5) return 0.;
  vec2 d=p-b.xy; vec2 dir=uD[i];
  vec2 q=vec2(dot(d,dir)/b.w, dot(d,vec2(-dir.y,dir.x)));
  float a=atan(q.y,q.x); float fi=float(i);
  // The wobble lives at the rim only: at the centre the angle is undefined and would crease the surface.
  float edge=smoothstep(.25*b.z,.85*b.z,length(q));
  float w=1.+edge*(0.034*sin(3.*a+uTime*1.05+fi*1.7)+0.022*sin(5.*a-uTime*1.55+fi)+0.012*sin(7.*a+uTime*2.2+fi*.5));
  float r=b.z*w;
  return r*r/(dot(q,q)+1.);
}
uniform float uK;
float dome(float f){ float s=1./sqrt(max(f,1e-4)); return uK*sqrt(max(0.,1.-s*s)); }
float field(vec2 p){ float f=0.; for(int i=0;i<${MAX};i++){ if(i>=uCount) break; f+=blob(i,p);} return f; }
void main(){
  vec2 p=vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y)/uDpr;
  // One pass: the field, and which blob owns this pixel most (its hover lifts the colour a little).
  float f=0.; float hov=0.; float best=0.;
  for(int i=0;i<${MAX};i++){ if(i>=uCount) break; float c=blob(i,p); f+=c; if(c>best){best=c; hov=uHover[i];} }
  float e=1.2;
  float fx=field(p+vec2(e,0.)), fy=field(p+vec2(0.,e));
  vec2 g=vec2(fx-f, fy-f)/e;
  float gl=length(g)+1e-5;
  float sd=(f-1.)/gl;                      // ~ signed distance in CSS px near the surface, inside > 0
  float a=clamp(sd*uDpr*.9+.5,0.,1.);
  // A dome over the field: s = 1/sqrt(f) is d/r for a lone blob, so H is an exact hemisphere there, and merged blobs
  // bulge like one piece of jelly. The normal comes from H, not from f, whose peak at a blob's centre would dent it.
  float H=dome(f), Hx=dome(fx), Hy=dome(fy);
  vec3 n=normalize(vec3(-(Hx-H)/e, -(Hy-H)/e, 1.));
  vec3 L=normalize(vec3(-.55,-.7,.85));
  float diff=clamp(dot(n,L),0.,1.);
  float spec=pow(clamp(dot(reflect(-L,n),vec3(0.,0.,1.)),0.,1.),42.);
  float spec2=pow(clamp(dot(reflect(-normalize(vec3(.6,.5,.7)),n),vec3(0.,0.,1.)),0.,1.),18.);
  float rim=pow(1.-n.z,1.6);
  vec3 pearl=mix(vec3(.972,.978,.992), vec3(.92,.94,.985), .25);
  vec3 blue=vec3(.70,.80,.97);
  vec3 base=mix(pearl, blue, .10+.42*rim);
  base=mix(base, uTint, uTintAmt*(.45+.55*rim));
  base=mix(base, vec3(1.), hov*.18);
  // A soft top-left sheen as well as the sharp highlight: wet, like jelly.
  float sheen=smoothstep(.55,1.,dot(n,normalize(vec3(-.45,-.55,.7))))*.22;
  vec3 col=base*(.70+.40*diff)+vec3(1.)*(spec*1.1+sheen)+vec3(.85,.9,1.)*spec2*.18;
  col+=vec3(.55,.68,1.)*rim*.08;
  col=mix(col, col*1.25+vec3(.05,.08,.2)*rim, uDark*.6);
  // Ground: a soft shadow on a white page, a halo on a dark one.
  float fs=field(p-vec2(0.,16.));
  float shadow=(1.-uDark)*.10*smoothstep(.30,1.05,fs);
  float halo=uDark*.30*smoothstep(.18,1.0,f)+uDark*.12*smoothstep(.05,.4,f);
  vec3 haloCol=mix(vec3(.55,.68,1.), uTint, uTintAmt*.8);
  float ga=max(shadow,halo);
  vec3 gcol=uDark>.5?haloCol:vec3(.06,.08,.14);
  o=vec4(col*a+gcol*ga*(1.-a), a+ga*(1.-a));
}`;

type Blob = { x: number; y: number; r: number; s: number; dx: number; dy: number };

export default function Orb({ tabs, mode, mood = 'calm', pulse, current, onNavigate, dark = false }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null), hub = useRef<HTMLButtonElement>(null);
  const kids = useRef<(HTMLButtonElement | null)[]>([]), labels = useRef<(HTMLSpanElement | null)[]>([]);
  const [open, setOpen] = useState(false), [fallback, setFallback] = useState(false);
  const state = useRef({ open: 0, openV: 0, target: 0, pop: 0, popV: 0, x: 0, y: 0, vx: 38, vy: 27, mx: -9999, my: -9999,
    hover: -1, hoverAmt: new Array(MAX).fill(0), R: 0, tint: [0.9, 0.93, 1] as number[], tintAmt: 0, lastInput: 0 });
  const live = useRef({ open, mode, mood, dark, tabs, onNavigate });
  useEffect(() => { live.current = { open, mode, mood, dark, tabs, onNavigate }; });

  useEffect(() => { state.current.target = open ? 1 : 0; }, [open]);
  useEffect(() => { if (pulse && pulse.n > 0) state.current.popV += pulse.strong ? 9 : 5; }, [pulse]);

  // Space opens and closes the fan; Escape closes it. Not while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest('input,textarea,select,[contenteditable=true]'))) return;
      if (event.code === 'Space') { event.preventDefault(); setOpen(value => !value); state.current.popV += 3; }
      if (event.code === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const gl = el.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) { setFallback(true); return; }
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
      return shader;
    };
    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    } catch (error) { console.error('ORB_SHADER', error); setFallback(true); return; }
    gl.useProgram(program);
    // The quad covers only the blobs plus their shadow or halo: a full-screen pass at retina size cost too much.
    const quad = new Float32Array(8);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(program, name);
    const U = { res: u('uRes'), dpr: u('uDpr'), time: u('uTime'), count: u('uCount'), b: u('uB'), d: u('uD'), tint: u('uTint'),
      tintAmt: u('uTintAmt'), dark: u('uDark'), hover: u('uHover'), k: u('uK') };
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      const rect = el.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height; el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
      gl.viewport(0, 0, el.width, el.height);
      // A page opened straight on a tab starts with the Orb already in its corner, not gliding there from the middle.
      const s = state.current; if (!s.x) { const dock = live.current.mode === 'dock'; s.x = dock ? 38 : w / 2; s.y = dock ? 38 : h / 2; s.R = dock ? 23 : 0; }
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(el);
    const onMove = (event: PointerEvent) => { const rect = el.getBoundingClientRect(); state.current.mx = event.clientX - rect.left; state.current.my = event.clientY - rect.top; state.current.lastInput = performance.now(); };
    const onLeave = () => { state.current.mx = -9999; state.current.my = -9999; };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerleave', onLeave);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const blobs: Blob[] = Array.from({ length: MAX }, () => ({ x: 0, y: 0, r: 0, s: 1, dx: 1, dy: 0 }));
    const bArr = new Float32Array(MAX * 4), dArr = new Float32Array(MAX * 2), hArr = new Float32Array(MAX);
    let frame = 0, last = performance.now(), skip = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const s = state.current, cur = live.current, n = cur.tabs.length;
      // Energy: after a minute without input on the home screen, draw every third frame.
      if (cur.mode === 'home' && !cur.open && now - s.lastInput > 60000 && (skip = (skip + 1) % 3) !== 0) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      // Springs: the fan opening, and the pop.
      s.openV += (170 * (s.target - s.open) - 20 * s.openV) * dt; s.open += s.openV * dt;
      s.popV += (-260 * s.pop - 14 * s.popV) * dt; s.pop += s.popV * dt;
      const moodTint = cur.mood === 'alert' ? [1, .36, .36] : cur.mood === 'good' ? [.3, .85, .5] : [.9, .93, 1];
      const want = cur.mood === 'calm' ? 0 : .75;
      s.tintAmt += (want - s.tintAmt) * Math.min(1, dt * 2.5);
      s.tint = s.tint.map((value, i) => value + (moodTint[i] - value) * Math.min(1, dt * 2.5));
      const scale = 1 + s.pop * 0.07;
      const home = cur.mode === 'home';
      const wantR = home ? Math.max(46, Math.min(96, Math.min(w, h) * 0.13)) : 23;
      s.R = s.R ? s.R + (wantR - s.R) * Math.min(1, dt * 5) : wantR;
      const R = s.R;
      // The hub: drifting like a DVD logo at home (still while the fan is open), tucked in the corner in a tab.
      if (home) {
        if (!reduce && s.target === 0 && s.open < 0.05) {
          s.x += s.vx * dt; s.y += s.vy * dt;
          const m = R * 1.15;
          if (s.x < m) { s.x = m; s.vx = Math.abs(s.vx); s.popV += 1.2; } if (s.x > w - m) { s.x = w - m; s.vx = -Math.abs(s.vx); s.popV += 1.2; }
          if (s.y < m + 40) { s.y = m + 40; s.vy = Math.abs(s.vy); s.popV += 1.2; } if (s.y > h - m) { s.y = h - m; s.vy = -Math.abs(s.vy); s.popV += 1.2; }
        } else if (reduce) { s.x += (w / 2 - s.x) * dt * 2; s.y += (h / 2 - s.y) * dt * 2; }
        // Opening near an edge: glide inward so every blade fits on screen.
        if (s.target === 1) {
          const room = R * 2.55 + R * 0.6;
          const tx = Math.min(Math.max(s.x, room), w - room), ty = Math.min(Math.max(s.y, room + 30), h - room);
          s.x += (tx - s.x) * Math.min(1, dt * 6); s.y += (ty - s.y) * Math.min(1, dt * 6);
        }
      } else { s.x += (38 - s.x) * Math.min(1, dt * 6); s.y += (38 - s.y) * Math.min(1, dt * 6); }
      const o = Math.max(0, Math.min(1.15, s.open));
      // Hub shrinks as the fan opens; it stays as the centre you click to close.
      const hubR = R * (1 - 0.42 * Math.min(o, 1)) * scale;
      blobs[0] = { x: s.x, y: s.y, r: hubR, s: 1, dx: 1, dy: 0 };
      // No spin: a target that moves is a target missed. The blades only breathe a little.
      const spin = 0;
      for (let i = 0; i < n; i++) {
        const hover = s.hover === i ? 1 : 0;
        s.hoverAmt[i] += (hover - s.hoverAmt[i]) * Math.min(1, dt * 10);
        let x: number, y: number, r: number, stretch: number, ang: number;
        if (home) {
          ang = -Math.PI / 2 + (i / n) * Math.PI * 2 + spin;
          const dist = R * 2.15 * o;
          x = s.x + Math.cos(ang) * dist; y = s.y + Math.sin(ang) * dist;
          // Blades: not all round, a little longer the further out, turned like a fan.
          r = R * (0.12 + 0.36 * Math.min(o, 1)) * (1 + 0.16 * s.hoverAmt[i]) * scale * (i % 2 ? 0.94 : 1.04);
          stretch = 1 + 0.38 * Math.min(o, 1) * (i % 3 === 0 ? 1.15 : 0.9);
          const blade = ang + 0.62;
          blobs[i + 1] = { x, y, r, s: stretch, dx: Math.cos(blade), dy: Math.sin(blade) };
        } else {
          x = s.x; y = s.y + 64 * (i + 1) * o;
          r = 21 * Math.min(o, 1) * (1 + 0.14 * s.hoverAmt[i]);
          stretch = 1 + 0.12 * Math.sin(t * 1.3 + i);
          blobs[i + 1] = { x, y, r, s: stretch, dx: Math.cos(0.4 + i), dy: Math.sin(0.4 + i) };
        }
        // DOM buttons ride on the blobs.
        const button = kids.current[i];
        if (button) {
          const visible = o > 0.55;
          button.style.transform = `translate(${blobs[i + 1].x - 26}px, ${blobs[i + 1].y - 26}px)`;
          button.style.opacity = String(Math.max(0, Math.min(1, (o - 0.5) * 2.4)));
          button.style.pointerEvents = visible ? 'auto' : 'none';
          button.tabIndex = visible ? 0 : -1;
        }
        const label = labels.current[i];
        if (label) label.style.opacity = String(s.hoverAmt[i]);
      }
      let count = n + 1;
      // The pointer near a resting hub pulls a little bead out of it: the jelly follows the hand.
      if (home && o < 0.2) {
        const dx = s.mx - s.x, dy = s.my - s.y, dist = Math.hypot(dx, dy);
        const near = Math.max(0, 1 - dist / (R * 2.2));
        if (near > 0 && count < MAX) {
          const pull = Math.min(dist, R * 1.05);
          blobs[count] = { x: s.x + dx / (dist || 1) * pull, y: s.y + dy / (dist || 1) * pull, r: R * 0.32 * near, s: 1, dx: 1, dy: 0 }; count++;
        }
      }
      if (hub.current) {
        const size = hubR * 2;
        hub.current.style.transform = `translate(${s.x - size / 2}px, ${s.y - size / 2}px)`;
        hub.current.style.width = hub.current.style.height = `${size}px`;
      }
      for (let i = 0; i < MAX; i++) {
        const b = blobs[i]; const on = i < count;
        bArr.set(on ? [b.x, b.y, b.r, b.s] : [0, 0, 0, 1], i * 4); dArr.set(on ? [b.dx, b.dy] : [1, 0], i * 2);
        hArr[i] = i > 0 && i <= n ? s.hoverAmt[i - 1] : 0;
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < count; i++) {
        const b = blobs[i], reach = b.r * Math.max(1, b.s) * 1.9 + 34;
        x0 = Math.min(x0, b.x - reach); x1 = Math.max(x1, b.x + reach); y0 = Math.min(y0, b.y - reach); y1 = Math.max(y1, b.y + reach + 18);
      }
      const cx = (x: number) => Math.max(-1, Math.min(1, x / w * 2 - 1)), cy = (y: number) => Math.max(-1, Math.min(1, 1 - y / h * 2));
      quad.set([cx(x0), cy(y1), cx(x1), cy(y1), cx(x0), cy(y0), cx(x1), cy(y0)]);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, quad);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.res, el.width, el.height); gl.uniform1f(U.dpr, dpr); gl.uniform1f(U.time, reduce ? 0 : t);
      gl.uniform1i(U.count, count); gl.uniform4fv(U.b, bArr); gl.uniform2fv(U.d, dArr); gl.uniform1fv(U.hover, hArr);
      gl.uniform3f(U.tint, s.tint[0], s.tint[1], s.tint[2]); gl.uniform1f(U.tintAmt, s.tintAmt); gl.uniform1f(U.dark, cur.dark ? 1 : 0);
      gl.uniform1f(U.k, R * 0.9);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerleave', onLeave); };
  }, []);

  const toggle = () => { setOpen(value => !value); state.current.popV += 3; state.current.lastInput = performance.now(); };
  return <div className={styles.stage} data-mode={mode} data-open={open} data-orb>
    <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
    {fallback && <div className={styles.fallback} aria-hidden="true" />}
    <button ref={hub} type="button" className={styles.hub} aria-expanded={open} aria-label={open ? 'Thu các tab lại' : 'Mở các tab'} onClick={toggle} data-orb-hub />
    {tabs.map((tab, i) => <button key={tab.key} ref={el => { kids.current[i] = el; }} type="button" className={styles.kid}
      data-current={tab.key === current} data-orb-tab={tab.key} aria-label={tab.label}
      onPointerEnter={() => { state.current.hover = i; }} onPointerLeave={() => { if (state.current.hover === i) state.current.hover = -1; }}
      onFocus={() => { state.current.hover = i; }} onBlur={() => { if (state.current.hover === i) state.current.hover = -1; }}
      onClick={() => { setOpen(false); onNavigate(tab); }}>
      <span className={styles.icon}>{tab.icon}</span>
      <span ref={el => { labels.current[i] = el; }} className={styles.label} data-side={mode === 'dock' ? 'right' : 'below'}>{tab.label}</span>
    </button>)}
  </div>;
}
