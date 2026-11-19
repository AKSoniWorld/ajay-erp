/** Indian financial year (Apr–Mar, IST) code, e.g. 31-Mar-2026 → "2526", 01-Apr-2026 → "2627". */
export function financialYearCode(d: Date = new Date()): string {
  const ist = new Date(d.getTime() + 19_800_000);
  const y = ist.getUTCFullYear(), start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}
/** INV = GST tax invoice · CN = its credit note · BOS = bill of supply (no GST) · BOSCN = its credit note */
export type DocKind = 'INV' | 'CN' | 'BOS' | 'BOSCN';
const INFIX: Record<DocKind, string> = { INV: '', CN: 'CN-', BOS: 'BS-', BOSCN: 'BS-CN-' };
export const formatDocNumber = (prefix: string, fy: string, seq: number, kind: DocKind = 'INV') =>
  `${prefix}-${INFIX[kind]}${fy}-${String(seq).padStart(6, '0')}`;
