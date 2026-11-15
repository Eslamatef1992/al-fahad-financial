import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import api, { fileUrl } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';

const n3 = (v) => Number(v || 0).toFixed(3);

function CreditNote({ ret, company }) {
  const inv = ret.invoice;
  return (
    <div style={{ width: '148mm', margin: '0 auto', padding: '8mm', fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#111', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #111', paddingBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {company?.logo_url && <img src={fileUrl(company.logo_url)} alt="" style={{ height: 36 }} />}
          <b style={{ fontSize: 14 }}>{company?.name_en}</b>
        </div>
        <div style={{ textAlign: 'end' }}>
          <b style={{ fontSize: 15 }}>CREDIT NOTE / إشعار دائن</b><br />
          <span>{ret.return_no}</span>
        </div>
      </div>
      <table style={{ width: '100%', margin: '8px 0', fontSize: 11 }}>
        <tbody>
          <tr><td>Date / التاريخ: <b>{ret.date}</b></td><td>Invoice / الفاتورة: <b>{inv?.invoice_no}</b></td></tr>
          <tr><td colSpan={2}>Client / العميل: <b>{ret.client?.name_en || '—'}</b></td></tr>
          {ret.reason && <tr><td colSpan={2}>Reason / السبب: {ret.reason}</td></tr>}
        </tbody>
      </table>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            {['Item / الصنف', 'Qty / الكمية', 'Price / السعر', 'Total / الإجمالي'].map((h) => <th key={h} style={{ border: '1px solid #999', padding: 3, textAlign: 'start' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {ret.lines.map((l) => (
            <tr key={l.id}>
              <td style={{ border: '1px solid #999', padding: 3 }}>{l.description || l.item?.name_en}</td>
              <td style={{ border: '1px solid #999', padding: 3 }}>{Number(l.quantity)}</td>
              <td style={{ border: '1px solid #999', padding: 3 }}>{n3(l.unit_price)}</td>
              <td style={{ border: '1px solid #999', padding: 3 }}>{n3(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'end', marginTop: 8, lineHeight: 1.7 }}>
        {Number(ret.tax_total) > 0 && <div>Tax / الضريبة: {n3(ret.tax_total)}</div>}
        <div style={{ fontSize: 13 }}><b>Total returned / إجمالي المرتجع: {n3(ret.total)}</b></div>
        {Number(ret.applied_to_invoice) > 0 && <div>Applied to invoice balance / خُصم من الفاتورة: {n3(ret.applied_to_invoice)}</div>}
        {Number(ret.refunded_amount) > 0 && <div>Refunded ({ret.refund_method}) / مردود: {n3(ret.refunded_amount)}</div>}
        {Number(ret.credited_amount) > 0 && <div>Client credit / رصيد للعميل: {n3(ret.credited_amount)}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, fontSize: 10 }}>
        <span>Customer signature / توقيع العميل: ____________</span><span>Authorised / المعتمد: ____________</span>
      </div>
    </div>
  );
}

// Prints a Sales Return as a credit note from anywhere in the app.
export async function printCreditNote(returnId) {
  const { data: ret } = await api.get(`/sales-returns/${returnId}`);
  const company = useCompanyStore.getState().activeCompany;
  const host = document.createElement('div');
  host.id = 'inv-print-host';
  host.style.display = 'none';
  const style = document.createElement('style');
  style.textContent = '@media print { body > *:not(#inv-print-host) { display: none !important; } #inv-print-host { display: block !important; } }';
  document.body.append(style, host);
  const root = createRoot(host);
  flushSync(() => root.render(<CreditNote ret={ret} company={company} />));
  if (document.fonts?.ready) await document.fonts.ready;
  const cleanup = () => { root.unmount(); host.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
