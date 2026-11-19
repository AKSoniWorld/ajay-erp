/** Start of today in IST, as a UTC Date. */
export const istDayStart = () => {
  const ist = new Date(Date.now() + 19_800_000); ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 19_800_000);
};
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Inclusive IST day range from 'YYYY-MM-DD' strings (default: 1st of this month → today). `to` is exclusive (next midnight). */
export function istRange(from?: string, to?: string) {
  const day = (d: Date) => new Date(d.getTime() + 19_800_000).toISOString().slice(0, 10);
  const today = day(new Date());
  const f = from ?? `${today.slice(0, 8)}01`, t = to ?? today;
  const start = new Date(`${f}T00:00:00+05:30`), last = new Date(`${t}T00:00:00+05:30`);
  return { from: start, to: new Date(last.getTime() + 86_400_000), fromStr: f, toStr: t, valid: !isNaN(start.getTime()) && !isNaN(last.getTime()) };
}
