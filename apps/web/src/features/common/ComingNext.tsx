export interface Planned { path: string; title: string; points: string[] }

/** Screens that are built in the next steps; the server side for each already exists. */
export function ComingNext({ title, points }: Planned) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="font-display text-2xl">{title}</h1>
      <p className="mt-2 text-sm text-muted">This screen is built in the next step. The server side is ready:</p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{points.map(p => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}

export const PLANNED: Planned[] = [
  { path: 'pos', title: 'New bill', points: ['Find items by name, SKU or QR-tag scan (handheld scanner or phone camera); keyboard-first (F2 find, F3 customer, F4 old metal, F5 dairy, F8 payment, F9 finish)', 'Old gold/silver with fine-weight preview, dairy and advance adjustments, split payments, round-off', 'Works offline: bills are kept on this device and sent later'] },
  { path: 'invoices', title: 'Bills', points: ['Search and open bills, print the A4 PDF, share, credit notes'] },
  { path: 'customers', title: 'Customers', points: ['Customer list with separate advance, due, dairy and purchase accounts and statements'] },
  { path: 'dairy', title: 'Dairy savings', points: ['Open schemes, collect monthly instalments (receipt PDF), missed months, maturity'] },
  { path: 'products', title: 'Products', points: ['Catalog with photos, QR code, tag printing (40×25 and 50×25 mm)'] },
  { path: 'inventory', title: 'Stock by branch', points: ['Stock per branch, movement history, raw (old) metal stock'] },
  { path: 'transfers', title: 'Transfers', points: ['Request, approve, dispatch and receive stock between branches'] },
  { path: 'suppliers', title: 'Suppliers & purchases', points: ['Purchases, cash and fine gold/silver balances, payments and rate cuts'] },
  { path: 'reports', title: 'Reports', points: ['Sales (GST and no-GST apart), branch comparison, old gold/silver, dairy, stock, ledgers — on screen, CSV and PDF'] },
  { path: 'branches', title: 'Branches', points: ['GSTIN, state, GST registration, printer and WhatsApp settings'] },
  { path: 'users', title: 'Staff', points: ['Create staff and owners, assign branches, deactivate'] },
  { path: 'sync', title: 'Sync review', points: ['Bills that need a decision after syncing from a device'] },
  { path: 'audit', title: 'Audit trail', points: ['Who changed what and when'] },
];
