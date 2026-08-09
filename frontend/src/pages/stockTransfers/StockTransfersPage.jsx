import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Printer, Download, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import usePermissions from '@/hooks/usePermissions';

const emptyLine = { item_id: '', variant_id: '', quantity: '' };
const empty = { from_branch_id: '', to_branch_id: '', date: new Date().toISOString().slice(0, 10), notes: '', lines: [{ ...emptyLine }] };

export default function StockTransfersPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit } = usePermissions();
  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [variantsByItem, setVariantsByItem] = useState({});
  const [viewRow, setViewRow] = useState(null);

  const load = () => { setLoading(true); api.get('/stock-transfers').then((r) => setRows(r.data)).finally(() => setLoading(false)); };
  useEffect(() => {
    if (activeCompany) {
      load();
      api.get('/items').then((r) => setItems(r.data));
      api.get('/branches').then((r) => setBranches(r.data));
    }
  }, [activeCompany]);

  const openNew = () => { setForm(empty); setOpen(true); };

  const itemById = (id) => items.find((i) => i.id === id);

  const ensureVariants = (itemId) => {
    if (!itemId || variantsByItem[itemId]) return;
    api.get(`/items/${itemId}/variants`).then((r) => {
      setVariantsByItem((prev) => ({ ...prev, [itemId]: r.data.filter((v) => v.is_active) }));
    });
  };

  const updateLine = (idx, patch) => {
    const lines = form.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    setForm({ ...form, lines });
    if (patch.item_id) ensureVariants(patch.item_id);
  };
  const addLine = () => setForm({ ...form, lines: [...form.lines, { ...emptyLine }] });
  const removeLine = (idx) => setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });

  const submit = async (e) => {
    e.preventDefault();
    if (form.from_branch_id === form.to_branch_id) {
      toast.error(t('stockTransfers.sameLocationError'));
      return;
    }
    if (form.lines.length === 0 || form.lines.some((l) => !l.item_id || !l.quantity)) {
      toast.error(t('stockTransfers.noLinesError'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/stock-transfers', form);
      toast.success(t('stockTransfers.transferred'));
      setOpen(false); load();
    } finally { setSaving(false); }
  };

  const locationLabel = (branch) => (branch ? `${branch.code} - ${branch.name_en}` : t('branches.unbranchedPool'));
  const lineLabel = (l) => `${l.item ? l.item.name_en : '?'}${l.variant ? ` (${l.variant.sku})` : ''} × ${Number(l.quantity).toFixed(2)}`;

  const columns = [
    { key: 'transfer_no', label: t('stockTransfers.transferNo') },
    { key: 'date', label: t('common.date') },
    { key: 'items', label: t('stockTransfers.lines'), render: (r) => (r.lines || []).map(lineLabel).join(', ') || '—' },
    { key: 'from', label: t('stockTransfers.from'), render: (r) => locationLabel(r.fromBranch) },
    { key: 'to', label: t('stockTransfers.to'), render: (r) => locationLabel(r.toBranch) },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.stockTransfers')}
        subtitle={t('stockTransfers.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => printFile('/stock-transfers/pdf', {})} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
            <button onClick={() => downloadFile('/stock-transfers/excel', {}, 'stock-transfers.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
            {canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('stockTransfers.newTransfer')}</button>}
          </div>
        }
      />
      <DataTable columns={columns} data={rows} loading={loading} onRowClick={setViewRow} pageSize={25} />

      <SlideOver open={open} onClose={() => setOpen(false)} title={t('stockTransfers.newTransfer')} onSubmit={submit} submitting={saving} wide>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('stockTransfers.from')}</label>
            <select className="input" value={form.from_branch_id} onChange={(e) => setForm({ ...form, from_branch_id: e.target.value })}>
              <option value="">{t('branches.unbranchedPool')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('stockTransfers.to')}</label>
            <select className="input" value={form.to_branch_id} onChange={(e) => setForm({ ...form, to_branch_id: e.target.value })}>
              <option value="">{t('branches.unbranchedPool')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">{t('common.date')}</label><input required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label !mb-0">{t('stockTransfers.lines')}</label>
            <button type="button" onClick={addLine} className="btn-ghost text-xs"><Plus size={13} /> {t('stockTransfers.addLine')}</button>
          </div>
          <div className="space-y-3">
            {form.lines.map((line, idx) => {
              const item = itemById(line.item_id);
              const variants = variantsByItem[line.item_id] || [];
              return (
                <div key={idx} className="rounded-xl border border-slate-200 dark:border-navy-700 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <select required className="input" value={line.item_id} onChange={(e) => updateLine(idx, { item_id: e.target.value, variant_id: '' })}>
                      <option value="">{t('common.select')}</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.code} - {i.name_en}</option>)}
                    </select>
                    {form.lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-500 shrink-0">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  {item?.variant_count > 0 && (
                    <select className="input" value={line.variant_id} onChange={(e) => updateLine(idx, { variant_id: e.target.value })}>
                      <option value="">{t('items.variant')}...</option>
                      {variants.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
                    </select>
                  )}
                  <input required type="number" step="0.001" min="0.001" placeholder={t('common.qty')} className="input" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                </div>
              );
            })}
          </div>
        </div>

        <div><label className="label">{t('common.notes')}</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <p className="text-xs text-slate-400">{t('stockTransfers.costHint')}</p>
      </SlideOver>

      <SlideOver open={!!viewRow} onClose={() => setViewRow(null)} title={viewRow?.transfer_no}>
        {viewRow && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-400">{t('common.date')}: </span>{viewRow.date}</div>
              <div><span className="text-slate-400">{t('stockTransfers.from')}: </span>{locationLabel(viewRow.fromBranch)}</div>
              <div><span className="text-slate-400">{t('stockTransfers.to')}: </span>{locationLabel(viewRow.toBranch)}</div>
            </div>
            <div className="space-y-2 mt-3">
              {(viewRow.lines || []).map((l) => (
                <div key={l.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-navy-800/50 text-sm">
                  <span>{l.item ? `${l.item.code} - ${l.item.name_en}` : '—'}{l.variant ? ` (${l.variant.sku})` : ''}</span>
                  <span className="font-semibold">{Number(l.quantity).toFixed(2)} @ {Number(l.unit_cost).toFixed(3)}</span>
                </div>
              ))}
            </div>
            {viewRow.notes && <p className="text-xs text-slate-400 mt-3">{viewRow.notes}</p>}
          </>
        )}
      </SlideOver>
    </div>
  );
}
