import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import InvoicePrintTemplate from '@/components/InvoicePrintTemplate';

// Prints any invoice with the one company invoice template (Cali Comfort A5),
// from anywhere in the app — fetches the invoice, renders the template into a
// temporary host, opens the print dialog, then cleans up.
export async function printInvoiceById(invoiceId, { deliveryNote = false, quantities = null } = {}) {
  let { data: invoice } = await api.get(`/invoices/${invoiceId}`);
  // Delivery note for part of the order: keep only the lines/quantities being handed over now,
  // with totals pro-rated, so the note matches exactly what the client receives.
  if (quantities) {
    const lines = (invoice.lines || []).filter((l) => Number(quantities[l.id]) > 0).map((l) => {
      const q = Number(quantities[l.id]); const f = Number(l.quantity) ? q / Number(l.quantity) : 1;
      return { ...l, quantity: q, line_total: Number(l.line_total) * f };
    });
    invoice = { ...invoice, lines, total: lines.reduce((s, l) => s + Number(l.line_total), 0) };
  }
  const company = useCompanyStore.getState().activeCompany;
  const host = document.createElement('div');
  host.id = 'inv-print-host';
  host.style.display = 'none';
  const style = document.createElement('style');
  style.textContent = '@media print { body > *:not(#inv-print-host) { display: none !important; } #inv-print-host { display: block !important; } }';
  document.body.append(style, host);
  const root = createRoot(host);
  flushSync(() => root.render(<InvoicePrintTemplate invoice={invoice} company={company} deliveryNote={deliveryNote} />));
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all([...host.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  const cleanup = () => { root.unmount(); host.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
