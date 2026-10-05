'use client';
/** Nút thao tác của một tab, đặt vào góc phải tiêu đề của khung (như ba nút tròn của YouTube Studio). */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function TabActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { void Promise.resolve().then(() => setTarget(document.getElementById('qs-tab-actions'))); }, []);
  return target ? createPortal(children, target) : null;
}
