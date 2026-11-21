
import { ExchangeItem, exchangeValue, fineMg, netMg, Paise } from './pricing.engine';

export interface ExchangeInput {
  metal: 'GOLD' | 'SILVER';
  grossMg: number;
  lessMg: number;
  purityPct: number;
  remarks?: string | null;
}

export interface PricedExchange extends ExchangeItem {
  netMg: number;
  fineMg: number;
  valuePaise: Paise;
}

/** Gold is valued at the 22K EXCHANGE rate, silver at the silver EXCHANGE rate. */
export const exchangeRateKey = (m: 'GOLD' | 'SILVER') =>
  m === 'GOLD' ? 'GOLD_22K' : 'SILVER';

/**
 * fine weight = net weight × purity % · value = fine weight × exchange rate.
 * The rate is always server-side (admin-controlled) — never accepted from the client.
 */
export function priceExchangeItems(inputs: ExchangeInput[], rates: Record<string, { ratePerGramPaise: number }>) {
  return inputs.map(i => {
    const key = exchangeRateKey(i.metal);
    const rate = rates[key]?.ratePerGramPaise;

    if (!rate) throw new Error(`${key.replace('_', ' ')} exchange rate not set`);

    if (i.lessMg < 0 || i.lessMg >= i.grossMg) {
      throw new Error('Less weight must be smaller than gross weight');
    }

    const item: ExchangeItem = {
      metal: i.metal,
      grossMg: i.grossMg,
      lessMg: i.lessMg,
      purityPct: i.purityPct,
      ratePerGramPaise: rate,
      remarks: i.remarks ?? null,
    };

    return {
      ...item,
      netMg: netMg(item),
      fineMg: fineMg(item),
      valuePaise: exchangeValue(item),
    };
  });
}

export function summarizeExchange(
  items: { metal: string; netMg: number; fineMg: number; valuePaise: number }[],
) {
  const t = {
    goldNetMg: 0,
    goldFineMg: 0,
    goldValuePaise: 0,
    silverNetMg: 0,
    silverFineMg: 0,
    silverValuePaise: 0,
  };

  for (const i of items) {
    const m = i.metal === 'GOLD' ? 'gold' : 'silver';
    (t as any)[`${m}NetMg`] += i.netMg;
    (t as any)[`${m}FineMg`] += i.fineMg;
    (t as any)[`${m}ValuePaise`] += i.valuePaise;
  }

  return t;
}
