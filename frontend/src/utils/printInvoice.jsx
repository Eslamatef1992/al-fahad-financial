import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import InvoicePrintTemplate from '@/components/InvoicePrintTemplate';

// Prints any invoice with the one company invoice template (Cali Comfort A5),
// from anywhere in the app — fetches the invoice, renders the template into a
// temporary host, opens the print dialog, then cleans up.
export async function printInvoiceById(invoiceId) {
  const { data: invoice } = await api.get(`/invoices/${invoiceId}`);
  const company = useCompanyStore.getState().activeCompany;
  const host = document.createElement('div');
  host.id = 'inv-print-host';
  host.style.display = 'none';
  const style = document.createElement('style');
  style.textContent = '@media print { body > *:not(#inv-print-host) { display: none !important; } #inv-print-host { display: block !important; } }';
  document.body.append(style, host);
  const root = createRoot(host);
  flushSync(() => root.render(<InvoicePrintTemplate invoice={invoice} company={company} />));
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all([...host.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  const cleanup = () => { root.unmount(); host.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
