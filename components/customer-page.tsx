'use client';
import Link from 'next/link';
import { useState } from 'react';
import { copy, topics, type Language, type Topic } from '@/lib/copy';
import { updateDemo, useDemo, visitor } from '@/lib/demo-store';
export default function CustomerPage() {
  const [language, setLanguage] = useState<Language>('vi');
  const t = copy[language]; const demo = useDemo(); const current = demo.records.find(r => r.id === 'THỬ01'); const rating = current?.rating ?? 0;
  const [expanded, setExpanded] = useState(false); const [pulse, setPulse] = useState(0);
  const [message, setMessage] = useState(''); const [topic, setTopic] = useState<Topic>('wait');
  const [notice, setNotice] = useState<'saved' | 'failure' | 'sent' | 'empty' | 'tooLong' | null>(null);
  const [linkNotice, setLinkNotice] = useState(false);
  function rate(score: number) {
    const saved = updateDemo(data => { visitor(data).rating = score; });
    setNotice(saved ? 'saved' : 'failure');
    if (score <= 3) { setExpanded(true); setPulse(n => n + 1); } else { setPulse(0); }
  }
  function send(e: React.FormEvent) {
    e.preventDefault(); if (!message.trim()) { setNotice('empty'); return; }
    if (message.trim().length > 2000) { setNotice('tooLong'); return; }
    setNotice(updateDemo(data => { const r = visitor(data); r.message = message.trim(); r.topic = topic; r.status = 'new'; }) ? 'sent' : 'failure');
  }
  return <main className="customer-wrap" lang={language}>
    <div className="demo-bar"><span>{t.demo}</span><Link href="/demo/dashboard">{t.owner} ↗</Link></div>
    <article className="phone">
      <div className="language"><label htmlFor="language">◎ Ngôn ngữ / Language</label><select id="language" value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></div>
      <div className="cover" role="img" aria-label={t.eventSub}><div className="cover-lines"/><span className="cover-label">4RÂU / BARBERSHOP</span><strong>{t.event}</strong><span className="cover-bottom">{t.eventSub}</span></div>
      <div className="customer-content"><div className="brand-logo" aria-label="4Râu">4R<span>BARBER</span></div><p className="eyebrow center">{t.badge}</p><h1>4Râu Barbershop</h1>
      <p className="question">{t.question}</p><div className="stars" role="group" aria-label={t.question}>{[1,2,3,4,5].map(score => <button type="button" key={score} aria-label={`${score} ${t.stars}`} aria-pressed={rating === score} data-filled={score <= rating} onClick={() => rate(score)}>★</button>)}</div>
      <p className="rating-receipt" aria-live="polite">{rating ? `${t.saved}: ${rating}/5` : '\u00a0'}</p>
      <section className="google-invitation" aria-label="Google Maps"><p>{t.invite}</p><button type="button" className="google-button" onClick={() => { if (!updateDemo(d => { d.googleClicks++; })) setNotice('failure'); setLinkNotice(true); }}><span className="google-g" aria-hidden="true">G</span>Google Maps<span aria-hidden="true">↗</span></button><p className="muted small">{t.thanks}</p></section>
      <button type="button" id="private-feedback" className={`feedback-trigger${rating > 0 && rating <= 3 ? ' needs-attention' : ''}`} aria-expanded={expanded} aria-controls="private-form" onClick={() => { setExpanded(!expanded); setPulse(0); }}><span key={pulse} className={pulse > 0 ? 'pulse-fill' : 'pulse-fill idle'} aria-hidden="true"/><span className="trigger-label">{t.private}<span aria-hidden="true"> {expanded ? '−' : '+'}</span></span></button>
      {expanded && <form id="private-form" className="feedback-form" onSubmit={send}><p className="muted small">{t.privateNote}</p><label htmlFor="topic">{t.topic}</label><select id="topic" value={topic} onChange={e => setTopic(e.target.value as Topic)}>{topics.map(k => <option key={k} value={k}>{t[k]}</option>)}</select><label htmlFor="message">{t.message}</label><textarea id="message" value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} rows={4} placeholder={t.placeholder}/><button className="primary" type="submit">{t.send}<span aria-hidden="true"> ↗</span></button></form>}
      <p className={`notice ${notice === 'failure' || notice === 'empty' || notice === 'tooLong' ? 'error' : ''}`} role="status">{notice && notice !== 'saved' ? t[notice] : ''}</p>
      <div className="social-links">{(['zalo','instagram','booking'] as const).map(k => <button type="button" key={k} onClick={() => setLinkNotice(true)}>{t[k]}<span aria-hidden="true">↗</span></button>)}</div>{linkNotice && <p className="muted small" role="status">{t.simulated}</p>}
      <footer>4RÂU BARBERSHOP</footer></div>
    </article>
  </main>;
}
