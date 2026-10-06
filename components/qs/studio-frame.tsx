'use client';
/**
 * Khung giao diện chính (kịch bản mục 6–7): Orb luôn có mặt; ở trang chủ nó trôi giữa trang trắng, vào tab thì núp góc trái
 * trên. Nằm trong layout nên đổi tab không dựng lại Orb — nó lướt từ giữa trang vào góc.
 */
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import Orb, { type OrbTab } from './orb';
import Icon from './icons';
import styles from './studio.module.css';
import { usePulse } from './use-pulse';
import { TAB_KEYS, TAB_LABELS, type TabKey } from './tabs-config';
import SupportBanner, { type SupportSession } from './support-banner';
import { BillingStrip } from './billing-notice';
import type { Billing } from '@/lib/billing/plans';
import ShopSwitcher, { ShopsContext, type Shops } from './shop-switcher';

const TAB_ICONS: Record<TabKey, Parameters<typeof Icon>[0]['name']> = { dashboard: 'dashboard', data: 'data', library: 'library', 'my-card': 'card', 'quan-ly': 'manage', 'cai-dat': 'settings' };

export default function StudioFrame({ slug, name, theme, support, billing, shops, children }: { slug: string; name: string; theme: 'light' | 'dark' | 'system';
  /** The shops this person can switch between, and whether they may add an address (G3b). */
  shops: Shops;
  /** The shop's plan: past its paid date, a strip says when the page goes off. */
  billing: Billing;
  /** An administrator's support session: its strip sits above every screen. */
  support: SupportSession | null; children: ReactNode }) {
  const router = useRouter(), path = usePathname();
  const current = TAB_KEYS.find(key => path?.startsWith(`/app/${slug}/${key}`)) ?? null;
  const [mode, setMode] = useState(theme), [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const chosen = (event: Event) => setMode((event as CustomEvent).detail);
    window.addEventListener('qs-theme', chosen);
    return () => window.removeEventListener('qs-theme', chosen);
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)'), change = () => setSystemDark(query.matches);
    void Promise.resolve().then(change); query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  const { pulse, mood } = usePulse(slug);
  const tabs: OrbTab[] = TAB_KEYS.map(key => ({ key, label: TAB_LABELS[key], href: `/app/${slug}/${key}`, icon: <Icon name={TAB_ICONS[key]} /> }));
  return <ShopsContext.Provider value={{ slug, shops }}><div className={`qs ${styles.frame}`} data-theme={mode} data-mode={current ? 'dock' : 'home'} data-support={support ? '' : undefined}
    data-billing={billing.state === 'grace' || billing.activateBy ? 'strip' : undefined}>
    <BillingStrip slug={slug} billing={billing} />
    {support && <SupportBanner slug={slug} session={support} />}
    <Orb tabs={tabs} mode={current ? 'dock' : 'home'} current={current ?? undefined} dark={dark} mood={mood} pulse={pulse}
      onNavigate={tab => router.push(tab.href)} />
    {current ? <div className={styles.tabArea}>
      <header className={styles.tabHeader}>
        <div className={styles.titles}>
          <div className={styles.shopLine}><button type="button" className={styles.homeLink} onClick={() => router.push(`/app/${slug}`)} aria-label="Về Orb">{name}</button>
            <ShopSwitcher /></div>
          <h1>{TAB_LABELS[current]}</h1>
        </div>
        <div id="qs-tab-actions" className={styles.tabActions} />
      </header>
      <main className={styles.tabMain}>{children}</main>
    </div> : children}
  </div></ShopsContext.Provider>;
}
