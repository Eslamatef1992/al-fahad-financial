import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Boxes, ArrowDownToLine, ArrowUpFromLine, Lock, Wallet, Printer, ArrowUpDown } from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';

const q = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const KIND = {
  opening: ['Opening', 'افتتاحي', 'bg-slate-100 text-slate-600'],
  purchase: ['Purchase', 'شراء', 'bg-emerald-50 text-emerald-700'],
  sale: ['Sale', 'بيع', 'bg-indigo-50 text-indigo-700'],
  delivery: ['Delivered', 'تسليم', 'bg-sky-50 text-sky-700'],
  return: ['Return', 'مرتجع', 'bg-pink-50 text-pink-700'],
  warranty: ['Warranty', 'ضمان', 'bg-orange-50 text-orange-700'],
  transfer: ['Transfer', 'تحويل', 'bg-violet-50 text-violet-700'],
  damage: ['Damage', 'تالف', 'bg-red-50 text-red-700'],
  adjustment: ['Adjustment', 'تسوية', 'bg-amber-50 text-amber-700'],
  booked: ['Booked', 'حجز', 'bg-yellow-50 text-yellow-700'],
  released: ['Released', 'تحرير', 'bg-slate-100 text-slate-500'],
};

// Everything that ever happened to one item — entry, purchases, sales, deliveries, returns,
// transfers, damages, adjustments, bookings — oldest to newest with a running stock balance.
export default function ItemMovementPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [params, setParams] = useSearchParams();
  const itemId = params.get('item') || '';
  const [text, setText] = useState('');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);
  const [kindFilter, setKindFilter] = useState('all');
  const box = useRef(null);

  useEffect(() => {
    if (!activeCompany || text.trim().length < 1) { setHits([]); return undefined; }
    const h = setTimeout(() => api.get('/items', { params: { q: text.trim(), status: 'all' } }).then((r) => setHits(r.data.slice(0, 10))).catch(() => setHits([])), 200);
    return () => clearTimeout(h);
  }, [text, activeCompany]);

  useEffect(() => {
    if (!activeCompany || !itemId) { setData(null); return; }
    setLoading(true);
    api.get(`/movements/item/${itemId}`).then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [itemId, activeCompany]);

  const pick = (it) => { setParams({ item: it.id }); setText(''); setHits([]); setOpen(false); };

  const events = useMemo(() => {
    let e = data?.events || [];
    if (kindFilter !== 'all') e = e.filter((x) => x.kind === kindFilter);
    return newestFirst ? [...e].reverse() : e;
  }, [data, newestFirst, kindFilter]);

  const th = 'px-3 py-2.5 text-start whitespace-nowrap';
  const s = data?.summary;
  return (
    <div>
      <PageHeader
        title={L('Item Movement', 'حركة الصنف')}
        subtitle={L('Every move of an item, from its first entry to the latest — purchases, sales, deliveries, returns, transfers, damages and bookings', 'كل حركات الصنف من أول إدخال حتى آخر حركة — مشتريات، مبيعات، تسليم، مرتجعات، تحويلات، تالف وحجوزات')}
        actions={data && <button onClick={() => window.print()} className="btn-ghost print:hidden"><Printer size={16} />{L('Print', 'طباعة')}</button>}
      />

      <div className="card p-4 mb-4 print:hidden relative" ref={box}>
        <label className="label">{L('Choose an item (number, name, SKU or barcode)', 'اختر الصنف (الرقم أو الاسم أو الباركود)')}</label>
        <div className="relative">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input ps-9" value={text} placeholder={data ? `${data.item.code} — ${data.item.name_en}` : L('Search items…', 'ابحث عن صنف…')}
            onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
        </div>
        {open && hits.length > 0 && (
          <div className="absolute z-30 mt-1 start-4 end-4 card p-1.5 max-h-72 overflow-y-auto shadow-lg">
            {hits.map((it) => (
              <button key={it.id} type="button" onMouseDown={() => pick(it)} className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-indigo-50 text-start">
                <span className="min-w-0"><span className="block text-sm font-medium truncate">{it.name_en}</span><span className="block text-[11px] text-slate-400">{it.code}</span></span>
                <span className="text-xs text-slate-500 shrink-0">{L('On hand', 'المخزون')}: <b>{q(it.total_quantity_on_hand)}</b></span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!itemId && <p className="text-sm text-slate-400 text-center py-16">{L('Pick an item to see its full movement history.', 'اختر صنفاً لعرض سجل حركته كاملاً.')}</p>}
      {itemId && loading && <p className="text-sm text-slate-400 text-center py-16">…</p>}

      {data && (
        <>
          <p className="font-bold text-lg mb-3">{data.item.code} — {isAr ? data.item.name_ar || data.item.name_en : data.item.name_en}</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <StatCard label={L('Total in', 'إجمالي الوارد')} value={q(s.total_in)} icon={ArrowDownToLine} tone="green" />
            <StatCard label={L('Total out', 'إجمالي الصادر')} value={q(s.total_out)} icon={ArrowUpFromLine} tone="red" delay={0.05} />
            <StatCard label={L('On hand', 'المخزون')} value={q(s.on_hand)} icon={Boxes} tone="navy" delay={0.1} />
            <StatCard label={L('Booked', 'المحجوز')} value={q(s.booked)} icon={Lock} tone="gold" delay={0.15} />
            <StatCard label={L('Available', 'المتاح')} value={q(s.available)} icon={Wallet} tone="green" delay={0.2} />
          </div>
          <p className="text-[11px] text-slate-400 mb-3">{L('On hand = Booked + Available. Booked units stay in stock until delivery is confirmed.', 'المخزون = المحجوز + المتاح. يبقى المحجوز في المخزون حتى تأكيد التسليم.')}</p>

          <div className="flex flex-wrap items-center gap-2 mb-3 print:hidden">
            <select className="input !w-48" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="all">{L('All movements', 'كل الحركات')}</option>
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{isAr ? v[1] : v[0]}</option>)}
            </select>
            <button onClick={() => setNewestFirst((v) => !v)} className="btn-ghost"><ArrowUpDown size={15} />{newestFirst ? L('Newest first', 'الأحدث أولاً') : L('Oldest first', 'الأقدم أولاً')}</button>
            <span className="text-xs text-slate-400">{events.length} {L('movements', 'حركة')} · {s.first || '—'} → {s.last || '—'}</span>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500">
                  {[L('Date', 'التاريخ'), L('Movement', 'الحركة'), L('Document', 'المستند'), L('Client / Supplier', 'العميل / المورد'), L('Store', 'المخزن'), L('In', 'وارد'), L('Out', 'صادر'), L('Balance', 'الرصيد'), L('By', 'بواسطة'), L('Notes', 'ملاحظات')].map((h) => <th key={h} className={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {!events.length && <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">{L('No movements.', 'لا حركات.')}</td></tr>}
                {events.map((e, i) => {
                  const k = KIND[e.kind] || KIND.adjustment;
                  return (
                    <tr key={i} className="border-t border-slate-100 dark:border-navy-800">
                      <td className="px-3 py-2 whitespace-nowrap">{e.at}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${k[2]}`}>{isAr ? k[1] : k[0]}</span> <span className="text-xs text-slate-500">{e.label}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap">{e.doc ? (e.doc.type === 'invoice' ? <Link className="text-indigo-600 hover:underline" to={`/invoices/${e.doc.id}`}>{e.doc.no}</Link> : e.doc.no) : '—'}</td>
                      <td className="px-3 py-2">{e.party || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{e.branch || '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-emerald-600 font-semibold">{e.stock && e.qty > 0 ? q(e.qty) : ''}</td>
                      <td className="px-3 py-2 tabular-nums text-rose-600 font-semibold">{e.stock && e.qty < 0 ? q(-e.qty) : (!e.stock && ['booked', 'released'].includes(e.kind) ? <span className="text-amber-600">{e.kind === 'booked' ? '🔒 ' : '🔓 '}{q(e.qty)}</span> : '')}</td>
                      <td className="px-3 py-2 tabular-nums font-bold">{q(e.balance)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">{e.user || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 max-w-[260px] truncate" title={e.notes}>{e.notes || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
