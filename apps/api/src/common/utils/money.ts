// Currency: Indian Rupees only. Input is always integer paise.
export const formatINR = (paise: number): string =>
  '₹ ' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const rupeesToPaise = (r: number): number => Math.round(r * 100);

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n: number) => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
const below1000 = (n: number) =>
  (n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + below100(n % 100);

function intWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(intWords(crore) + ' Crore');
  if (lakh) parts.push(below100(lakh) + ' Lakh');
  if (thousand) parts.push(below100(thousand) + ' Thousand');
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}

export function amountInWords(paise: number): string {
  const r = Math.floor(Math.abs(paise) / 100), p = Math.abs(paise) % 100;
  return `Rupees ${intWords(r)}${p ? ' and ' + below100(p) + ' Paise' : ''} Only`;
}
