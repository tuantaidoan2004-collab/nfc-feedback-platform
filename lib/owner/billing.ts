import type { Pool } from 'pg';
import { authorize, transaction, OwnerError, type OwnerCredential } from './auth';
import { priceSheet } from '../publishing/pricing';
import { transferMemo, type BillingStatus, type PaymentSettings } from '../billing/rules';

/**
 * The shop's billing tab (lát P5b-lite, migration 031; ui-ux-nguon-tham-khao.md mục 5H): what a month costs today, how far
 * the shop has paid or may try for free, and how to pay -- the operator's QR code and account, the transfer's content,
 * and where to send the receipt. Only the shop's owner, signed in as themself: money is theirs to see.
 */
export type OwnerBillingView = {
  monthly: number; status: BillingStatus;
  history: { kind: 'trial' | 'payment'; amountVnd: number; coversUntil: string; recordedAt: string }[];
  transfer: (PaymentSettings & { memo: string }) | null;
};

export class OwnerBilling {
  constructor(private pool: Pool) {}

  async get(credential: OwnerCredential, slug: string): Promise<OwnerBillingView> {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'shell');
      if (access.actor.kind !== 'owner' || access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
      // The same price the page list shows (pricing.ts): the live template's, two paid pages free.
      const pages = (await db.query(`SELECT p.slug,p.state,p.created_at,COALESCE(lt.template_key,tv.template_key) template_key FROM pages p
        JOIN page_drafts d ON d.page_id=p.id JOIN template_versions tv ON tv.id=d.template_version_id
        LEFT JOIN page_releases r ON r.id=p.active_release_id LEFT JOIN template_versions lt ON lt.id=r.template_version_id
        WHERE p.shop_id=$1`, [access.shopId])).rows;
      const monthly = priceSheet(pages.map(row => ({ slug: row.slug, state: row.state, templateKey: row.template_key, createdAt: row.created_at }))).monthly;
      const history = (await db.query(`SELECT kind,amount_vnd,covers_until::text covers_until,recorded_at,
          (covers_until-(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::int days_left
        FROM shop_payments WHERE shop_id=$1 ORDER BY recorded_at DESC,id DESC LIMIT 24`, [access.shopId])).rows;
      const latest = history[0];
      const settings = (await db.query("SELECT value FROM platform_settings WHERE key='payment'")).rows[0]?.value as PaymentSettings | undefined;
      return { monthly,
        status: latest ? { kind: latest.kind, coversUntil: latest.covers_until, daysLeft: latest.days_left } : { kind: 'none' },
        history: history.map(row => ({ kind: row.kind, amountVnd: row.amount_vnd, coversUntil: row.covers_until, recordedAt: new Date(row.recorded_at).toISOString() })),
        transfer: settings ? { ...settings, memo: transferMemo(access.slug) } : null };
    });
  }
}
