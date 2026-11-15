import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import { Timeline, LinesTable } from '@/pages/movement/InvoiceMovement';

const n3 = (v) => Number(v || 0).toFixed(3);

// Super admin view: everything one client bought, received, booked, returned, replaced and exchanged.
export default function ClientMovementPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [focusInvoice, setFocusInvoice] = useState(null);

  // Search by phone number, client name/code, or invoice number.
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return undefined; }
    const h = setTimeout(() => api.get('/movements/search', { params: { q } }).then((r) => setHits(r.data)).catch(() => setHits(null)), 250);
    return () => clearTimeout(h);
  }, [q]);
  const pickClient = (id, invoiceId) => { setClientId(id); setFocusInvoice(invoiceId || null); setOpen(invoiceId || null); setHits(null); setQ(''); };

  useEffect(() => { if (activeCompany) api.get('/clients').then((r) => setClients(r.data)).catch(() => {}); }, [activeCompany]);
  useEffect(() => { setD(null); if (clientId) api.get(`/movements/client/${clientId}`).then((r) => setD(r.data)).catch(() => setD(null)); }, [clientId]);

  const T = d?.totals;
  return (
    <div>
      <PageHeader title={L('Client movement', 'حركة العميل')} subtitle={L('Every item a client bought, received, booked, returned, replaced or exchanged', 'كل صنف اشتراه العميل أو استلمه أو حجزه أو أرجعه أو استبدله')} />
      <div className="card p-4 mb-4 relative">
        <label className="label">{L('Search by phone number, client or invoice number', 'بحث برقم الهاتف أو العميل أو رقم الفاتورة')}</label>
        <input className="input max-w-xl" autoFocus placeholder="99887766 · INV-000123 · eslam" value={q} onChange={(e) => setQ(e.target.value)} />
        {hits && (
          <div className="absolute z-30 mt-1 w-full max-w-xl card p-1.5 shadow-lg max-h-80 overflow-y-auto">
            {hits.clients.map((c) => (
              <button key={c.id} onClick={() => pickClient(c.id)} className="w-full text-start px-3 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-navy-800 text-sm">
                <b>{isAr ? c.name_ar || c.name_en : c.name_en}</b> <span className="text-slate-400 ms-2">{c.phone || ''}</span>
              </button>
            ))}
            {hits.invoices.map((i) => (
              <button key={i.id} onClick={() => pickClient(i.client_id, i.id)} className="w-full text-start px-3 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-navy-800 text-sm">
                <b className="font-mono">{i.invoice_no}</b> <span className="text-slate-400 ms-2">{i.date} · {i.client?.name_en || ''} {i.client?.phone || ''}</span>
              </button>
            ))}
            {!hits.clients.length && !hits.invoices.length && <p className="px-3 py-2 text-sm text-slate-400">{L('No match.', 'لا نتائج.')}</p>}
          </div>
        )}
      </div>
      <div className="card p-4 mb-4"><label className="label">{L('Client', 'العميل')}</label>
        <select className="input max-w-md" value={clientId} onChange={(e) => { setClientId(e.target.value); setFocusInvoice(null); }}>
          <option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{isAr ? c.name_ar || c.name_en : c.name_en}{c.phone ? ` — ${c.phone}` : ''}</option>)}
        </select></div>
      {T && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3 mb-5">
            {[[L('Invoices', 'فواتير'), T.invoices], [L('Sold', 'مباع'), T.sold], [L('Delivered', 'مسلّم'), T.delivered], [L('Still booked', 'محجوز'), T.booked_pending], [L('Returned', 'مرتجع'), T.returned], [L('Replaced', 'مستبدل'), T.replaced], [L('Exchanged', 'مبدَّل'), T.exchanged], [L('Billed / paid', 'فواتير / مدفوع'), `${n3(T.billed)} / ${n3(T.paid)}`]].map(([lab, v]) => (
              <div key={lab} className="card p-3"><p className="text-[10px] text-slate-400 uppercase font-semibold">{lab}</p><p className="text-lg font-extrabold mt-0.5 break-words">{v}</p></div>
            ))}
          </div>
          <div className="grid xl:grid-cols-[1.3fr_1fr] gap-5">
            <div className="space-y-3">
              {[...d.invoices].sort((a, b) => (a.id === focusInvoice ? -1 : b.id === focusInvoice ? 1 : 0)).map((inv) => (
                <div key={inv.id} className={`card p-4 ${inv.id === focusInvoice ? 'ring-2 ring-indigo-300' : ''}`}>
                  <button className="w-full flex items-center justify-between text-start" onClick={() => setOpen(open === inv.id ? null : inv.id)}>
                    <span><a href={`/invoices/${inv.id}`} className="font-bold text-indigo-600 hover:underline" onClick={(e) => e.stopPropagation()}>{inv.invoice_no}</a> <span className="text-xs text-slate-400 ms-2">{inv.date} · {inv.channel === 'pos' ? 'POS' : L('Back office', 'إدارة')}</span></span>
                    <span className="text-sm"><b>{n3(inv.total)}</b>{inv.returned_total > 0 && <span className="text-rose-600 text-xs ms-2">−{n3(inv.returned_total)}</span>}</span>
                  </button>
                  {open === inv.id && <div className="mt-3"><LinesTable lines={inv.lines} L={L} isAr={isAr} /></div>}
                </div>
              ))}
              {!d.invoices.length && <p className="text-sm text-slate-400">{L('No sales for this client yet.', 'لا مبيعات لهذا العميل بعد.')}</p>}
            </div>
            <div className="card p-5 h-fit"><p className="font-bold mb-4">{L('Timeline', 'السجل الزمني')}</p><Timeline events={d.events} showInvoice /></div>
          </div>
        </>
      )}
    </div>
  );
}
