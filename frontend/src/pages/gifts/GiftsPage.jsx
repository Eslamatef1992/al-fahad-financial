import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift } from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';

const n3 = (v) => Number(v || 0).toFixed(3);
const iso = (d) => d.toISOString().slice(0, 10);

// Free items handed out on sales (POS "Gift" tick): quantity, what they cost us and what they would have sold for.
export default function GiftsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [from, setFrom] = useState(() => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!activeCompany) return;
    api.get('/gifts', { params: { from, to } }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [activeCompany, from, to]);

  return (
    <div>
      <PageHeader title={L('Gifts', 'الهدايا')} subtitle={L('Items given free with a sale (tick “Gift” on a POS line)', 'أصناف تُمنح مجاناً مع البيع (فعّل «هدية» على بند في نقطة البيع)')} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label={L('Gift lines', 'عدد الهدايا')} value={data?.totals.count ?? 0} icon={Gift} tone="pink" />
        <StatCard label={L('Units given', 'الوحدات الممنوحة')} value={data?.totals.quantity ?? 0} icon={Gift} tone="purple" delay={0.05} />
        <StatCard label={L('Cost to us', 'التكلفة علينا')} value={n3(data?.totals.cost)} icon={Gift} tone="red" delay={0.1} />
        <StatCard label={L('Retail value', 'القيمة البيعية')} value={n3(data?.totals.retail_value)} icon={Gift} tone="gold" delay={0.15} />
      </div>
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div><label className="label">{L('From', 'من')}</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">{L('To', 'إلى')}</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500">
            {[L('Date', 'التاريخ'), L('Invoice', 'الفاتورة'), L('Client', 'العميل'), L('Item', 'الصنف'), L('Qty', 'الكمية'), L('Cost', 'التكلفة'), L('Retail value', 'القيمة البيعية'), L('Sales person', 'المندوب'), L('Branch', 'الفرع')].map((h) => <th key={h} className="px-3 py-2.5 text-start whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody>
            {!data?.rows.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">{L('No gifts in this period.', 'لا هدايا في هذه الفترة.')}</td></tr>}
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-navy-800">
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2"><a className="text-indigo-600 hover:underline" href={`/invoices/${r.invoice_id}`}>{r.invoice_no}</a></td>
                <td className="px-3 py-2">{r.client || '—'}</td>
                <td className="px-3 py-2"><span className="text-slate-400 me-1">{r.code}</span>{isAr ? r.name_ar || r.name_en : r.name_en}</td>
                <td className="px-3 py-2 tabular-nums">{r.quantity}</td>
                <td className="px-3 py-2 tabular-nums">{n3(r.cost)}</td>
                <td className="px-3 py-2 tabular-nums">{n3(r.retail_value)}</td>
                <td className="px-3 py-2">{r.salesperson || '—'}</td>
                <td className="px-3 py-2">{r.branch || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
