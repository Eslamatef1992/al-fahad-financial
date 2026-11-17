import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import ReceiptVoucherTemplate from '@/components/ReceiptVoucherTemplate';

// Prints a receipt voucher on the company's paper-form layout (A5 landscape, company logo).
export async function printReceiptVoucher(voucherId) {
  const { data: voucher } = await api.get(`/vouchers/${voucherId}`);
  const company = useCompanyStore.getState().activeCompany;
  const host = document.createElement('div');
  host.id = 'inv-print-host';
  host.style.display = 'none';
  const style = document.createElement('style');
  style.textContent = '@media print { body > *:not(#inv-print-host) { display: none !important; } #inv-print-host { display: block !important; } #inv-print-host, #inv-print-host * { visibility: visible !important; } }';
  document.body.append(style, host);
  const root = createRoot(host);
  flushSync(() => root.render(<ReceiptVoucherTemplate voucher={voucher} company={company} />));
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all([...host.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  const cleanup = () => { root.unmount(); host.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
