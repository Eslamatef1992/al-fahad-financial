import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  Boxes, Wallet, ArrowRightLeft, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, PackageX, SlidersHorizontal,
  CalendarClock, ShieldAlert, ScrollText, Warehouse, Download, Printer,
} from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

const n = (v, d = 3) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const q0 = (v) => n(v, 0);
const iso = (d) => d.toISOString().slice(0, 10);

const TYPE_LABEL = {
  opening: ['Opening', 'افتتاحي'], purchase_receipt: ['Purchase receipt', 'استلام مشتريات'], sale: ['Sale', 'بيع'],
  adjustment: ['Adjustment', 'تسوية'], transfer_out: ['Transfer out', 'تحويل صادر'], transfer_in: ['Transfer in', 'تحويل وارد'],
};
const DAMAGE_LABEL = {
  transport: ['Transport', 'نقل'], warehouse: ['Warehouse', 'مخزن'], manufacturing_defect: ['Manufacturing defect', 'عيب تصنيع'],
  customer_return: ['Customer return', 'مرتجع عميل'], water_damage: ['Water damage', 'تلف مياه'], other: ['Other', 'أخرى'],
};

// Column: [key, en, ar, kind]  kind: name | loc | type | damage | q (quantity) | m (money)
const ITEM = [['code', 'Item no.', 'رقم الصنف'], ['name', 'Product', 'الصنف', 'name']];
const MOVE_COLS = [
  ['date', 'Date', 'التاريخ'], ...ITEM, ['type', 'Type', 'النوع', 'type'], ['reference_type', 'Reference', 'المرجع'],
  ['branch', 'Location', 'الموقع'], ['quantity', 'Quantity', 'الكمية', 'q'], ['unit_cost', 'Unit cost', 'تكلفة الوحدة', 'm'],
  ['value', 'Value', 'القيمة', 'm'], ['balance_qty_after', 'Balance', 'الرصيد', 'q'], ['notes', 'Notes', 'ملاحظات'],
];

const REPORTS = [
  { key: 'stock-summary', icon: Boxes, en: 'Stock Summary', ar: 'ملخص المخزون', d_en: 'Current quantity of every product', d_ar: 'الكمية الحالية لكل صنف', loc: true,
    cols: [...ITEM, ['unit', 'Unit', 'الوحدة'], ['qty', 'On hand', 'الكمية', 'q'], ['booked', 'Booked', 'محجوز', 'q'], ['available', 'Available', 'متاح', 'q'], ['reorder_level', 'Min qty', 'الحد الأدنى', 'q']] },
  { key: 'stock-valuation', icon: Wallet, en: 'Stock Valuation', ar: 'تقييم المخزون', d_en: 'Total inventory value based on cost', d_ar: 'قيمة المخزون الإجمالية حسب التكلفة', loc: true,
    cols: [...ITEM, ['qty', 'Quantity', 'الكمية', 'q'], ['avg_cost', 'Avg cost', 'متوسط التكلفة', 'm'], ['value', 'Value', 'القيمة', 'm']] },
  { key: 'stock-movement', icon: ArrowRightLeft, en: 'Stock Movement', ar: 'حركة المخزون', d_en: 'All incoming and outgoing stock', d_ar: 'كل الوارد والصادر', cols: MOVE_COLS, loc: true, dates: true },
  { key: 'stock-in', icon: ArrowDownToLine, en: 'Stock In', ar: 'تقرير الوارد', d_en: 'Purchases, receiving and stock additions', d_ar: 'المشتريات والاستلام والإضافات', cols: MOVE_COLS, loc: true, dates: true },
  { key: 'stock-out', icon: ArrowUpFromLine, en: 'Stock Out', ar: 'تقرير الصادر', d_en: 'Sales, transfers and stock deductions', d_ar: 'المبيعات والتحويلات والخصومات', cols: MOVE_COLS, loc: true, dates: true },
  { key: 'low-stock', icon: AlertTriangle, en: 'Low Stock', ar: 'المخزون المنخفض', d_en: 'Products below minimum quantity', d_ar: 'أصناف أقل من الحد الأدنى', loc: true,
    cols: [...ITEM, ['qty', 'On hand', 'الكمية', 'q'], ['reorder_level', 'Min qty', 'الحد الأدنى', 'q']] },
  { key: 'out-of-stock', icon: PackageX, en: 'Out of Stock', ar: 'نفد من المخزون', d_en: 'Products with zero available stock', d_ar: 'أصناف بلا مخزون متاح', loc: true,
    cols: [...ITEM, ['qty', 'On hand', 'الكمية', 'q'], ['booked', 'Booked', 'محجوز', 'q'], ['available', 'Available', 'متاح', 'q']] },
  { key: 'adjustments', icon: SlidersHorizontal, en: 'Inventory Adjustment', ar: 'تسويات المخزون', d_en: 'Manual additions and deductions', d_ar: 'الإضافات والخصومات اليدوية', cols: MOVE_COLS, loc: true, dates: true },
  { key: 'expiry', icon: CalendarClock, en: 'Expiry', ar: 'تقرير الصلاحية', d_en: 'Products close to expiration', d_ar: 'أصناف قاربت على الانتهاء', loc: true, days: true,
    cols: [...ITEM, ['expiry_date', 'Expiry date', 'تاريخ الانتهاء'], ['days_left', 'Days left', 'الأيام المتبقية', 'q'], ['qty', 'On hand', 'الكمية', 'q'], ['value', 'Value', 'القيمة', 'm']] },
  { key: 'damaged', icon: ShieldAlert, en: 'Damaged Stock', ar: 'المخزون التالف', d_en: 'Damaged, lost or unusable products', d_ar: 'أصناف تالفة أو مفقودة', loc: true, dates: true,
    cols: [['date', 'Date', 'التاريخ'], ...ITEM, ['damage_type', 'Reason', 'السبب', 'damage'], ['status', 'Status', 'الحالة'], ['branch', 'Location', 'الموقع'], ['quantity', 'Quantity', 'الكمية', 'q'], ['value', 'Value', 'القيمة', 'm'], ['notes', 'Notes', 'ملاحظات']] },
  { key: 'product-ledger', icon: ScrollText, en: 'Product Ledger', ar: 'كارت الصنف', d_en: 'Complete transaction history per product', d_ar: 'سجل كامل لحركات الصنف', cols: MOVE_COLS, product: true, dates: true },
  { key: 'warehouse-stock', icon: Warehouse, en: 'Warehouse Stock', ar: 'مخزون المستودعات', d_en: 'Stock quantities by warehouse / location', d_ar: 'الكميات حسب المستودع / الموقع', loc: true,
    cols: [['location', 'Warehouse', 'المستودع', 'loc'], ...ITEM, ['unit', 'Unit', 'الوحدة'], ['qty', 'Quantity', 'الكمية', 'q'], ['value', 'Value', 'القيمة', 'm']] },
];

export default function StockReportsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [sp, setSp] = useSearchParams();
  const key = sp.get('r') || 'stock-summary';
  const rep = REPORTS.find((r) => r.key === key) || REPORTS[0];

  const [branches, setBranches] = useState([]);
  const [items, setItems] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [itemId, setItemId] = useState('');
  const [from, setFrom] = useState(() => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeCompany) return;
    api.get('/branches').then((r) => setBranches(r.data)).catch(() => {});
    api.get('/items').then((r) => setItems(r.data)).catch(() => {});
  }, [activeCompany]);

  useEffect(() => {
    if (!activeCompany) return;
    if (rep.product && !itemId) { setData(null); return; }
    setLoading(true);
    api.get(`/inventory-reports/analytics/${rep.key}`, {
      params: {
        branch_id: rep.loc ? branchId || undefined : undefined, item_id: rep.product ? itemId || undefined : undefined,
        from: rep.dates ? from : undefined, to: rep.dates ? to : undefined, days: rep.days ? days : undefined,
      },
    }).then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [activeCompany, rep.key, branchId, itemId, from, to, days]);

  const cell = (r, [k, , , kind]) => {
    if (kind === 'name') return isAr ? r.name_ar || r.name_en : r.name_en;
    if (kind === 'loc') return isAr ? r.location_ar : r.location_en;
    if (kind === 'type') return (TYPE_LABEL[r.type] || [r.type, r.type])[isAr ? 1 : 0];
    if (kind === 'damage') return (DAMAGE_LABEL[r.damage_type] || [r.damage_type, r.damage_type])[isAr ? 1 : 0];
    if (kind === 'q') return q0(r[k]);
    if (kind === 'm') return n(r[k]);
    return r[k] ?? '—';
  };
  const label = (c) => (isAr ? c[2] : c[1]);
  const rows = data?.rows || [];

  const exportCsv = () => {
    const head = rep.cols.map(label);
    const lines = rows.map((r) => rep.cols.map((c) => `"${String(cell(r, c)).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([`﻿${head.join(',')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${rep.key}-${iso(new Date())}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const totalCols = useMemo(() => new Set(Object.keys(data?.totals || {})), [data]);

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title={L('Stock Reports', 'تقارير المخزون')} subtitle={L('Choose a report, filter, then print or export', 'اختر تقريراً ثم صفِّ وأطبع أو صدّر')} />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
          {REPORTS.map((r) => (
            <button
              key={r.key} onClick={() => setSp({ r: r.key })}
              className={`text-start rounded-2xl p-3.5 border transition-all ${r.key === rep.key ? 'border-indigo-400 bg-indigo-50 dark:bg-navy-800 shadow-sm' : 'border-slate-100 dark:border-navy-800 bg-white dark:bg-navy-900 hover:border-indigo-200'}`}
            >
              <r.icon size={18} className={r.key === rep.key ? 'text-indigo-600' : 'text-slate-400'} />
              <p className="text-sm font-bold mt-2 text-navy-900 dark:text-white">{isAr ? r.ar : r.en}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{isAr ? r.d_ar : r.d_en}</p>
            </button>
          ))}
        </div>

        <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
          {rep.loc && (
            <div>
              <label className="label">{L('Location', 'الموقع')}</label>
              <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">{L('All locations', 'كل المواقع')}</option>
                <option value="pool">{L('Main store', 'المخزن الرئيسي')}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {isAr ? b.name_ar || b.name_en : b.name_en}</option>)}
              </select>
            </div>
          )}
          {rep.product && (
            <div className="min-w-[240px]">
              <label className="label">{L('Product', 'الصنف')} *</label>
              <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">—</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.code} - {isAr ? i.name_ar || i.name_en : i.name_en}</option>)}
              </select>
            </div>
          )}
          {rep.dates && (
            <>
              <div><label className="label">{L('From', 'من')}</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><label className="label">{L('To', 'إلى')}</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </>
          )}
          {rep.days && (
            <div>
              <label className="label">{L('Expiring within (days)', 'تنتهي خلال (يوم)')}</label>
              <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[30, 60, 90, 180, 365].map((x) => <option key={x} value={x}>{x}</option>)}</select>
            </div>
          )}
          <div className="flex gap-2 ms-auto">
            <button onClick={exportCsv} disabled={!rows.length} className="btn-ghost"><Download size={16} />{L('Export CSV', 'تصدير CSV')}</button>
            <button onClick={() => window.print()} disabled={!rows.length} className="btn-ghost"><Printer size={16} />{L('Print', 'طباعة')}</button>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-navy-800 flex items-center justify-between">
          <h2 className="font-bold text-navy-900 dark:text-white">{isAr ? rep.ar : rep.en}</h2>
          <span className="text-xs text-slate-400">{data ? `${data.count} ${L('rows', 'سجل')}` : ''}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500">
              {rep.cols.map((c) => <th key={c[0]} className="px-3 py-2.5 text-start whitespace-nowrap">{label(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={rep.cols.length} className="px-3 py-8 text-center text-slate-400">…</td></tr>}
            {!loading && !rows.length && (
              <tr><td colSpan={rep.cols.length} className="px-3 py-8 text-center text-slate-400">
                {rep.product && !itemId ? L('Choose a product to see its ledger.', 'اختر صنفاً لعرض الكارت.') : L('No data for this report.', 'لا بيانات لهذا التقرير.')}
              </td></tr>
            )}
            {!loading && rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-navy-800">
                {rep.cols.map((c) => {
                  const isNum = ['q', 'm'].includes(c[3]);
                  const neg = isNum && Number(r[c[0]]) < 0;
                  return <td key={c[0]} className={`px-3 py-2 whitespace-nowrap ${isNum ? 'tabular-nums' : ''} ${neg ? 'text-rose-600' : ''}`}>{cell(r, c)}</td>;
                })}
              </tr>
            ))}
          </tbody>
          {!loading && rows.length > 0 && totalCols.size > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-900 font-bold">
                {rep.cols.map((c, i) => (
                  <td key={c[0]} className="px-3 py-2.5 tabular-nums">
                    {i === 0 ? L('Total', 'الإجمالي') : totalCols.has(c[0]) ? (c[3] === 'm' ? n(data.totals[c[0]]) : q0(data.totals[c[0]])) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
