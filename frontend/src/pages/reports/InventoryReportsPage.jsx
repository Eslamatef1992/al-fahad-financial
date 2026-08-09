import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Download, Printer, Boxes, AlertTriangle, ArrowRightLeft, ScrollText } from 'lucide-react';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import ReportKpiCard from '@/components/ReportKpiCard';

const TABS = [
  { key: 'valuation', icon: Boxes },
  { key: 'lowStock', icon: AlertTriangle },
  { key: 'movement', icon: ScrollText },
  { key: 'transferHistory', icon: ArrowRightLeft },
];

export default function InventoryReportsPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [tab, setTab] = useState('valuation');
  const [branches, setBranches] = useState([]);

  useEffect(() => { if (activeCompany) api.get('/branches').then((r) => setBranches(r.data)); }, [activeCompany]);

  return (
    <div>
      <PageHeader title={t('inventoryReports.title')} />

      <div className="flex items-center gap-2 mb-5 border-b border-slate-100 dark:border-navy-800 overflow-x-auto">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              tab === tb.key ? 'border-gold-500 text-navy-900 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <tb.icon size={16} /> {t(`inventoryReports.${tb.key}`)}
          </button>
        ))}
      </div>

      {tab === 'valuation' && <ValuationTab branches={branches} />}
      {tab === 'lowStock' && <LowStockTab branches={branches} />}
      {tab === 'movement' && <MovementTab branches={branches} />}
      {tab === 'transferHistory' && <TransferHistoryTab branches={branches} />}
    </div>
  );
}

function LocationSelect({ value, onChange, branches, t }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('inventoryReports.allLocations')}</option>
      <option value="pool">{t('inventoryReports.poolOnly')}</option>
      {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
    </select>
  );
}

function variantLabel(r) {
  if (!r.variant_id) return '-';
  const attrs = Object.entries(r.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
  return attrs ? `${r.variant_sku} (${attrs})` : r.variant_sku;
}

function ValuationTab({ branches }) {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const currency = activeCompany?.base_currency || 'KWD';
  const [branchId, setBranchId] = useState('');
  const [data, setData] = useState({ rows: [], total_value: 0 });
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/inventory-reports/valuation', { params: { branch_id: branchId } }).then((r) => setData(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">{t('inventoryReports.valuationSubtitle')}</p>
      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]"><label className="label">{t('common.branch')}</label><LocationSelect value={branchId} onChange={setBranchId} branches={branches} t={t} /></div>
        <button onClick={load} className="btn-primary">{t('reports.generate')}</button>
        <button onClick={() => printFile('/inventory-reports/valuation/pdf', { branch_id: branchId })} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
        <button onClick={() => downloadFile('/inventory-reports/valuation/excel', { branch_id: branchId }, 'stock-valuation.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
      </div>

      {!loading && data.rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <ReportKpiCard icon={Boxes} tone="navy" label={t('common.total')} value={String(data.rows.length)} />
          <ReportKpiCard icon={Boxes} tone="gold" label={t('inventoryReports.totalValue')} value={`${Number(data.total_value).toFixed(3)} ${currency}`} delay={0.05} />
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-800">
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('common.code')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('items.item')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('items.variant')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('items.stockOnHand')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('items.avgCost')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('items.stockValue')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && data.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">{t('common.noData')}</td></tr>}
            {!loading && data.rows.map((r, i) => (
              <tr key={`${r.item_id}-${r.variant_id || 'x'}-${i}`} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.code}</td>
                <td className="px-4 py-3">{r.name_en}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{variantLabel(r)}</td>
                <td className="px-4 py-3 text-end">{Number(r.quantity_on_hand).toFixed(2)}</td>
                <td className="px-4 py-3 text-end">{Number(r.cost_price).toFixed(3)}</td>
                <td className="px-4 py-3 text-end font-semibold">{Number(r.value).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}

function LowStockTab({ branches }) {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [branchId, setBranchId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/inventory-reports/low-stock', { params: { branch_id: branchId } }).then((r) => setRows(r.data.rows)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">{t('inventoryReports.lowStockSubtitle')}</p>
      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]"><label className="label">{t('common.branch')}</label><LocationSelect value={branchId} onChange={setBranchId} branches={branches} t={t} /></div>
        <button onClick={load} className="btn-primary">{t('reports.generate')}</button>
        <button onClick={() => printFile('/inventory-reports/low-stock/pdf', { branch_id: branchId })} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
        <button onClick={() => downloadFile('/inventory-reports/low-stock/excel', { branch_id: branchId }, 'low-stock.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
      </div>

      {!loading && rows.length === 0 && <p className="text-center text-emerald-600 bg-emerald-50 dark:bg-emerald-950 rounded-xl p-6">{t('inventoryReports.noLowStock')}</p>}

      {!loading && rows.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-navy-800">
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('common.code')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('items.item')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('items.variant')}</th>
                <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('items.stockOnHand')}</th>
                <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('items.reorderLevel')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.item_id}-${r.variant_id || 'x'}-${i}`} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.code}</td>
                  <td className="px-4 py-3">{r.name_en}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{variantLabel(r)}</td>
                  <td className="px-4 py-3 text-end text-red-500 font-semibold">{Number(r.quantity_on_hand).toFixed(2)}</td>
                  <td className="px-4 py-3 text-end">{Number(r.reorder_level).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}

function MovementTab({ branches }) {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [items, setItems] = useState([]);
  const [itemId, setItemId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [variants, setVariants] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (activeCompany) api.get('/items').then((r) => setItems(r.data)); }, [activeCompany]);
  useEffect(() => {
    setVariantId(''); setVariants([]);
    if (itemId) api.get(`/items/${itemId}/variants`).then((r) => setVariants(r.data.filter((v) => v.is_active)));
  }, [itemId]);

  const load = () => {
    if (!itemId) return;
    setLoading(true);
    api.get('/inventory-reports/movement', { params: { item_id: itemId, variant_id: variantId, branch_id: branchId, from, to } })
      .then((r) => setData(r.data)).finally(() => setLoading(false));
  };

  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">{t('inventoryReports.movementSubtitle')}</p>
      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label className="label">{t('items.item')}</label>
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">{t('common.select')}</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.code} - {i.name_en}</option>)}
          </select>
        </div>
        {variants.length > 0 && (
          <div className="min-w-[160px]">
            <label className="label">{t('items.variant')}</label>
            <select className="input" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">{t('common.allBranches') /* all variants combined */}</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
            </select>
          </div>
        )}
        <div className="min-w-[160px]"><label className="label">{t('common.branch')}</label><LocationSelect value={branchId} onChange={setBranchId} branches={branches} t={t} /></div>
        <div><label className="label">{t('reports.from')}</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">{t('reports.to')}</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button onClick={load} className="btn-primary" disabled={!itemId}>{t('reports.generate')}</button>
        {data && (
          <>
            <button onClick={() => printFile('/inventory-reports/movement/pdf', { item_id: itemId, variant_id: variantId, branch_id: branchId, from, to })} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
            <button onClick={() => downloadFile('/inventory-reports/movement/excel', { item_id: itemId, variant_id: variantId, branch_id: branchId, from, to }, 'stock-movement.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
          </>
        )}
      </div>

      {!itemId && <p className="text-center text-slate-400 p-10">{t('inventoryReports.selectItem')}</p>}

      {itemId && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-navy-800">
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('common.date')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('common.type')}</th>
                <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('common.qty')}</th>
                <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('items.avgCost')}</th>
                <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('items.stockOnHand')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t('common.loading')}</td></tr>}
              {!loading && data && data.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t('common.noData')}</td></tr>}
              {!loading && data && data.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3 capitalize">{r.type.replace('_', ' ')}</td>
                  <td className={`px-4 py-3 text-end font-semibold ${Number(r.quantity) < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{Number(r.quantity) > 0 ? '+' : ''}{Number(r.quantity).toFixed(2)}</td>
                  <td className="px-4 py-3 text-end">{Number(r.unit_cost).toFixed(3)}</td>
                  <td className="px-4 py-3 text-end">{Number(r.balance_qty_after).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}

function TransferHistoryTab({ branches }) {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const locationLabel = (branch) => (branch ? `${branch.code} - ${branch.name_en}` : t('branches.unbranchedPool'));
  const lineLabel = (l) => `${l.item ? l.item.name_en : '?'}${l.variant ? ` (${l.variant.sku})` : ''} × ${Number(l.quantity).toFixed(2)}`;

  const load = () => {
    setLoading(true);
    api.get('/stock-transfers', { params: { branch_id: branchId, from, to } }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">{t('inventoryReports.transferHistorySubtitle')}</p>
      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]"><label className="label">{t('common.branch')}</label><LocationSelect value={branchId} onChange={setBranchId} branches={branches} t={t} /></div>
        <div><label className="label">{t('reports.from')}</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">{t('reports.to')}</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button onClick={load} className="btn-primary">{t('reports.generate')}</button>
        <button onClick={() => printFile('/stock-transfers/pdf', { branch_id: branchId, from, to })} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
        <button onClick={() => downloadFile('/stock-transfers/excel', { branch_id: branchId, from, to }, 'stock-transfers.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-800">
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('stockTransfers.transferNo')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('common.date')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('stockTransfers.lines')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('stockTransfers.from')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('stockTransfers.to')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t('common.noData')}</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.transfer_no}</td>
                <td className="px-4 py-3">{r.date}</td>
                <td className="px-4 py-3">{(r.lines || []).map(lineLabel).join(', ')}</td>
                <td className="px-4 py-3">{locationLabel(r.fromBranch)}</td>
                <td className="px-4 py-3">{locationLabel(r.toBranch)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
