/** Money is paise, weight is mg — formatted here only. Indian digit grouping (₹ 1,23,456.00). */
export const formatINR = (paise: number | null | undefined, opts: { decimals?: boolean } = {}) => {
  if (paise === null || paise === undefined) return '—';
  const d = opts.decimals === false ? 0 : 2;
  const s = (Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${paise < 0 ? '−' : ''}₹ ${s}`;
};
export const rupeesToPaise = (r: number) => Math.round(r * 100);
export const grams = (mg: number | null | undefined) => (mg === null || mg === undefined ? '—' : `${(mg / 1000).toFixed(3)} g`);

const IST = 19_800_000;
/** Today (IST) as YYYY-MM-DD */
export const todayIST = () => new Date(Date.now() + IST).toISOString().slice(0, 10);
/** First day of this month (IST), and day arithmetic on YYYY-MM-DD strings — for report date presets. */
export const monthStartIST = (d = todayIST()) => `${d.slice(0, 8)}01`;
export const addDaysIST = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const lastMonthIST = () => { const first = monthStartIST(); const end = addDaysIST(first, -1); return { from: monthStartIST(end), to: end }; };
export const timeIST = (d: string | Date) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const dateIST = (d: string | Date) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
export const dateTimeIST = (d: string | Date) =>
  new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
