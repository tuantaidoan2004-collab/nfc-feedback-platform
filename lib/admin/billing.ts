import type { Pool } from 'pg';
import { transaction } from '../owner/auth';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';
import { BillingError, readPayment, readPaymentSettings, type PaymentSettings } from '../billing/rules';

/**
 * The operator's half of the billing tab (lát P5b-lite, migration 031): where the money goes (entered here by Tài, never
 * in the code), and what each shop has paid. A record is never changed; a newer one replaces it.
 */
const translate = (error: unknown): never => { if (error instanceof BillingError) throw new AdminError(400, error.code); throw error; };
export type DueShop = { shop_id: string; slug: string; name: string; kind: 'trial' | 'payment'; covers_until: string; days_left: number };

export class AdminBilling {
  constructor(private pool: Pool) {}

  async settings(): Promise<PaymentSettings | null> {
    return (await this.pool.query("SELECT value FROM platform_settings WHERE key='payment'")).rows[0]?.value ?? null;
  }

  async saveSettings(adminId: string, body: unknown) {
    let settings: PaymentSettings; try { settings = readPaymentSettings(body); } catch (error) { return translate(error); }
    return transaction(this.pool, async db => {
      await db.query(`INSERT INTO platform_settings(key,value,updated_by)VALUES('payment',$1,$2)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()`, [settings, adminId]);
      // The picture itself stays out of the record; whether there is one is enough to read the history by.
      await recordAdminAction(db, adminId, { action: 'billing.settings', detail: { bank: settings.bank, holder: settings.holder, account: settings.account,
        zalo: settings.zalo, qr: !!settings.qr } });
      return settings;
    });
  }

  async record(adminId: string, body: unknown) {
    let input; try { input = readPayment(body); } catch (error) { return translate(error); }
    return transaction(this.pool, async db => {
      if (!(await db.query('SELECT 1 FROM shops WHERE id=$1 AND NOT is_template', [input.shopId])).rowCount) throw new AdminError(404, 'SHOP_NOT_FOUND');
      const row = (await db.query(`INSERT INTO shop_payments(shop_id,kind,amount_vnd,covers_until,note,recorded_by)VALUES($1,$2,$3,$4,$5,$6)
        RETURNING id,covers_until::text`, [input.shopId, input.kind, input.amountVnd, input.coversUntil, input.note, adminId])).rows[0];
      await recordAdminAction(db, adminId, { action: 'billing.record', shopId: input.shopId,
        detail: { payment: row.id, kind: input.kind, amountVnd: input.amountVnd, coversUntil: input.coversUntil, ...(input.note ? { note: input.note } : {}) } });
      return { id: row.id as string, coversUntil: row.covers_until as string };
    });
  }

  /** Each shop's newest record, for the shop list: how far it has paid or may try. */
  async latest(): Promise<Record<string, { kind: 'trial' | 'payment'; coversUntil: string }>> {
    const rows = (await this.pool.query(`SELECT DISTINCT ON (shop_id) shop_id,kind,covers_until::text covers_until FROM shop_payments
      ORDER BY shop_id,recorded_at DESC,id DESC`)).rows;
    return Object.fromEntries(rows.map(row => [row.shop_id, { kind: row.kind, coversUntil: row.covers_until }]));
  }

  /** Shops whose newest record ends within `days` days or has ended: the ones to remind on Zalo. Most urgent first. */
  async due(days = 7): Promise<DueShop[]> {
    return (await this.pool.query(`SELECT s.id shop_id,s.slug,s.name,p.kind,p.covers_until::text covers_until,
        (p.covers_until-(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::int days_left
      FROM shops s JOIN LATERAL (SELECT kind,covers_until FROM shop_payments WHERE shop_id=s.id ORDER BY recorded_at DESC,id DESC LIMIT 1) p ON true
      WHERE NOT s.is_template AND p.covers_until-(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<=$1 ORDER BY days_left,s.name`, [days])).rows;
  }
}
