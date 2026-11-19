export type ColType = 'text' | 'money' | 'weight' | 'int' | 'date' | 'pct';
export interface ReportCol { key: string; label: string; type: ColType }
/** Money is in paise and weights in mg in JSON; CSV/PDF show rupees and grams. */
export interface Report {
  title: string;
  period?: { from: string; to: string };
  columns: ReportCol[];
  rows: Record<string, any>[];
  totals?: Record<string, any>;
  meta?: Record<string, any>;
}
