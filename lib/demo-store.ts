'use client';
import { useSyncExternalStore } from 'react';
import { topics, type Topic } from './copy';
export type Status = 'new' | 'progress' | 'resolved';
export type Experience = { id: string; rating: number; message: string; topic: Topic; status: Status; note: string; updatedAt: string; source: string };
export type Demo = { version: 1; records: Experience[]; googleClicks: number };
const key = 'nfc-feedback:demo:v1';
const event = 'nfc-demo-updated';
const initial: Demo = { version: 1, googleClicks: 0, records: [
  { id: 'M01', rating: 2, message: 'Chờ 25 phút nhưng không được báo trước.', topic: 'wait', status: 'new', note: '', updatedAt: 'Mẫu · 14:20', source: 'Quầy 01' },
  { id: 'M02', rating: 5, message: '', topic: 'other', status: 'new', note: '', updatedAt: 'Mẫu · 13:45', source: 'Gương 02' },
  { id: 'M03', rating: 3, message: 'Phần mái ngắn hơn hình tôi đưa.', topic: 'cut', status: 'progress', note: 'Xác nhận lại độ dài với khách trước khi cắt.', updatedAt: 'Mẫu · 11:10', source: 'Gương 01' },
] };
const empty = JSON.stringify(initial);
function snapshot() { try { return localStorage.getItem(key) ?? empty; } catch { return empty; } }
function decode(raw: string): Demo {
  try {
    const value = JSON.parse(raw) as Demo;
    if (value.version !== 1 || !Number.isSafeInteger(value.googleClicks) || value.googleClicks < 0 || !Array.isArray(value.records) || value.records.length > 100) return structuredClone(initial);
    const ids = new Set<string>();
    for (const r of value.records) {
      if (!r || typeof r.id !== 'string' || ids.has(r.id) || !Number.isInteger(r.rating) || r.rating < 0 || r.rating > 5 || !topics.includes(r.topic) || !['new','progress','resolved'].includes(r.status) || ![r.message,r.note,r.updatedAt,r.source].every(v => typeof v === 'string' && v.length <= 2000)) return structuredClone(initial);
      ids.add(r.id);
    }
    return value;
  } catch { return structuredClone(initial); }
}
function subscribe(listener: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) listener(); };
  window.addEventListener(event, listener); window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(event, listener); window.removeEventListener('storage', onStorage); };
}
export function useDemo() { return decode(useSyncExternalStore(subscribe, snapshot, () => empty)); }
export function updateDemo(change: (data: Demo) => void): boolean {
  try { const data = decode(snapshot()); change(data); localStorage.setItem(key, JSON.stringify(data)); window.dispatchEvent(new Event(event)); return true; } catch { return false; }
}
export function visitor(data: Demo): Experience {
  let current = data.records.find(r => r.id === 'THỬ01');
  if (!current) { current = { id: 'THỬ01', rating: 0, message: '', topic: 'other', status: 'new', note: '', updatedAt: '', source: 'Quầy 01' }; data.records.unshift(current); }
  current.updatedAt = new Date().toISOString(); return current;
}
