import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import InvoicePrintTemplate from '@/components/InvoicePrintTemplate';

const METHOD = { cash: 'Cash / نقداً', knet: 'KNET / كي نت', other: 'Other / أخرى', credit: 'Client credit / رصيد عميل' };

// Prints a Sales Return as a credit note in the same Cali Comfort A5 layout as the invoice
// (red serial + "Credit Note / إشعار دائن" title), listing the returned items and how the
// client was repaid.
export async function printCreditNote(returnId) {
  const { data: ret } = await api.get(`/sales-returns/${returnId}`);
  const company = useCompanyStore.getState().activeCompany;
  let salesperson = null;
  try { const { data: inv } = await api.get(`/invoices/${ret.invoice_id}`); salesperson = inv.salesperson; } catch (e) { /* optional */ }
  const doc = {
    invoice_no: ret.return_no, date: ret.date, client: ret.client, salesperson, notes: ret.reason || '',
    total: ret.total, amount_in_words_ar: ret.amount_in_words_ar, amount_in_words_en: ret.amount_in_words_en,
    lines: (ret.lines || []).map((l) => ({
      id: l.id, item: l.item, description: l.description || l.item?.name_en, quantity: l.quantity, unit_price: l.unit_price, line_total: l.line_total,
    })),
  };
  const creditNote = {
    invoice_no: ret.invoice?.invoice_no || '', method: METHOD[ret.refund_method] || ret.refund_method,
    applied: Number(ret.applied_to_invoice || 0), refunded: Number(ret.refunded_amount || 0), credited: Number(ret.credited_amount || 0),
  };
  const host = document.createElement('div');
  host.id = 'inv-print-host';
  host.style.display = 'none';
  const style = document.createElement('style');
  style.textContent = '@media print { body > *:not(#inv-print-host) { display: none !important; } #inv-print-host { display: block !important; } #inv-print-host, #inv-print-host * { visibility: visible !important; } }';
  document.body.append(style, host);
  const root = createRoot(host);
  flushSync(() => root.render(<InvoicePrintTemplate invoice={doc} company={company} creditNote={creditNote} />));
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all([...host.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  const cleanup = () => { root.unmount(); host.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
