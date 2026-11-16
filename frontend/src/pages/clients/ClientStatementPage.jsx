import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Printer, ArrowLeft } from 'lucide-react';
import api from '@/api/client';
import PageHeader from '@/components/PageHeader';

const m = (n) => Number(n || 0).toFixed(3);
const fmtDate = (d) => { if (!d) return ''; const [y, mo, da] = String(d).slice(0, 10).split('-'); return `${da}/${mo}/${y}`; };

// Client account statement (كشف حساب) laid out like the legacy system report:
// Date | Code | Center | Bill no. | Details | Notes | Debit | Credit | Balance, totals at the foot.
export default function ClientStatementPage() {
  const { id } = useParams();
  const { i18n } = useTranslation();
  const ar = i18n.language?.startsWith('ar');
  const L = (en, a) => (ar ? a : en);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get(`/clients/${id}/statement`, { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } })
      .then((r) => setData(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const th = 'border border-slate-400 px-2 py-1.5 text-center font-bold bg-slate-100 text-[12px] whitespace-nowrap';
  const td = 'border border-slate-300 px-2 py-1.5 text-[13px] align-top';

  return (
    <div>
      <style>{`@media print { body * { visibility: hidden !important; } #stmt, #stmt * { visibility: visible !important; } #stmt { position: absolute; left: 0; top: 0; width: 100%; padding: 12mm; } }`}</style>
      <div className="print:hidden">
        <PageHeader
          title={L('Account statement', 'كشف حساب')}
          actions={<button onClick={() => window.print()} className="btn-ghost flex items-center gap-1.5"><Printer size={16} />{L('Print', 'طباعة')}</button>}
        />
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <div><label className="label">{L('From', 'من')}</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label">{L('To', 'إلى')}</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button onClick={load} className="btn-primary">OK</button>
          <Link to="/clients" className="btn-ghost flex items-center gap-1.5"><ArrowLeft size={15} />{L('Clients', 'العملاء')}</Link>
        </div>
      </div>

      <div id="stmt" className="card p-5 overflow-x-auto">
        {loading && <p className="text-sm text-slate-400">{L('Loading…', 'جارٍ التحميل…')}</p>}
        {data && (
          <>
            <div className="text-center mb-3">
              <p className="font-bold text-lg">{(ar ? data.company.name_ar : null) || data.company.name_en}</p>
              <p className="font-bold text-base">{L('Account Statement', 'كشف حساب')}</p>
            </div>
            <div className="flex flex-wrap justify-between gap-4 text-sm mb-3">
              <div className="space-y-0.5">
                <p><span className="text-slate-500">{L('Client no.', 'رقم العميل')}: </span><b dir="ltr">{data.client.phone || data.client.code}</b></p>
                <p><span className="text-slate-500">{L('Client name', 'اسم العميل')}: </span><b>{(ar ? data.client.name_ar : null) || data.client.name_en}</b></p>
              </div>
              <div className="space-y-0.5 text-end">
                <p><span className="text-slate-500">{L('From date', 'من تاريخ')}: </span><b>{data.from ? fmtDate(data.from) : '01/01/1900'}</b></p>
                <p><span className="text-slate-500">{L('To date', 'إلى')}: </span><b>{fmtDate(data.to || today)}</b></p>
              </div>
            </div>
            <table className="w-full border-collapse min-w-[860px]">
              <thead>
                <tr>
                  <th className={th}>{L('Date', 'التاريخ')}</th>
                  <th className={th}>{L('Code', 'الحركة')}</th>
                  <th className={th}>{L('Center', 'الفرع')}</th>
                  <th className={th}>{L('Bill no.', 'رقم السند')}</th>
                  <th className={`${th} w-1/4`}>{L('Details', 'البيان')}</th>
                  <th className={th}>{L('Notes', 'الملاحظات')}</th>
                  <th className={th}>{L('Debit', 'مدين')}</th>
                  <th className={th}>{L('Credit', 'دائن')}</th>
                  <th className={th}>{L('Balance', 'الرصيد')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className={r.opening ? 'bg-slate-50 font-semibold' : ''}>
                    <td className={`${td} whitespace-nowrap`}>{fmtDate(r.date)}</td>
                    <td className={td}>{ar ? r.type_ar : r.type}</td>
                    <td className={`${td} text-center`}>{r.center}</td>
                    <td className={`${td} whitespace-nowrap`}>{r.bill_no}</td>
                    <td className={td}>{r.details}</td>
                    <td className={td}>{r.notes}</td>
                    <td className={`${td} text-end tabular-nums`}>{m(r.debit)}</td>
                    <td className={`${td} text-end tabular-nums`}>{m(r.credit)}</td>
                    <td className={`${td} text-end tabular-nums font-semibold`}>{m(r.balance)}</td>
                  </tr>
                ))}
                {!data.rows.length && !loading && (
                  <tr><td colSpan={9} className={`${td} text-center text-slate-400 py-6`}>{L('No movements', 'لا توجد حركات')}</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-slate-100">
                  <td colSpan={6} className={`${td} text-end`}>{L('Total', 'الإجمالي')}</td>
                  <td className={`${td} text-end tabular-nums`}>{m(data.totals.debit)}</td>
                  <td className={`${td} text-end tabular-nums`}>{m(data.totals.credit)}</td>
                  <td className={`${td} text-end tabular-nums ${data.totals.balance > 0 ? 'text-rose-600' : ''}`}>{m(data.totals.balance)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-3 text-sm">
              <span className="text-slate-500">{L('Balance', 'الرصيد')}: </span>
              <b className={data.totals.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}>{m(data.totals.balance)}</b>
              <span className="text-slate-400 text-xs ms-4">{fmtDate(today)}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
