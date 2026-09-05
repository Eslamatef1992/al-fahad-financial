import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CheckCircle2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';

const empty = { item_id: '', variant_id: '', branch_id: '', quantity: '', damage_type: 'other', notes: '' };

export default function DamagesPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [damageTypes, setDamageTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('reported');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [itemSearch, setItemSearch] = useState('');
  const [variants, setVariants] = useState([]);
  const [saving, setSaving] = useState(false);
  const [clearTarget, setClearTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/damages', { params: { status: statusFilter } }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (activeCompany) {
      load();
      api.get('/items', { params: { status: 'active' } }).then((r) => setItems(r.data));
      api.get('/branches').then((r) => setBranches(r.data));
      api.get('/damages/types').then((r) => setDamageTypes(r.data));
    }
  }, [activeCompany, statusFilter]);

  useEffect(() => {
    if (form.item_id) {
      api.get(`/items/${form.item_id}/variants`).then((r) => setVariants(r.data)).catch(() => setVariants([]));
    } else {
      setVariants([]);
    }
  }, [form.item_id]);

  const filteredItems = useMemo(() => {
    if (!itemSearch) return items;
    const q = itemSearch.toLowerCase();
    return items.filter((i) => i.code?.toLowerCase().includes(q) || i.name_en?.toLowerCase().includes(q) || i.name_ar?.includes(q));
  }, [items, itemSearch]);

  const openNew = () => {
    setForm(empty);
    setItemSearch('');
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/damages', {
        ...form,
        variant_id: form.variant_id || null,
        branch_id: form.branch_id || null,
        quantity: Number(form.quantity),
      });
      toast.success(t('damages.reported'));
      setOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const clear = async () => {
    try {
      await api.post(`/damages/${clearTarget.id}/clear`);
      toast.success(t('damages.cleared'));
      setClearTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('common.error'));
      setClearTarget(null);
    }
  };

  const remove = async () => {
    await api.delete(`/damages/${deleteTarget.id}`);
    toast.success(t('common.deleted'));
    setDeleteTarget(null);
    load();
  };

  const columns = [
    { key: 'item', label: t('items.item'), render: (r) => r.item ? `${r.item.code} - ${r.item.name_en}` : '—' },
    { key: 'variant', label: t('items.variant'), render: (r) => r.variant?.sku || '—' },
    { key: 'branch', label: t('common.branch'), render: (r) => r.branch ? `${r.branch.code} - ${r.branch.name_en}` : t('branches.unbranchedPool') },
    { key: 'quantity', label: t('common.qty'), render: (r) => Number(r.quantity).toFixed(2) },
    { key: 'damage_type', label: t('damages.type'), render: (r) => t(`damages.type_${r.damage_type}`) },
    { key: 'notes', label: t('common.notes'), render: (r) => r.notes || '—' },
    { key: 'reported_by', label: t('damages.reportedBy'), render: (r) => r.reporter?.name || '—' },
    { key: 'status', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.status === 'cleared' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
        {t(`damages.status_${r.status}`)}
      </span>
    ) },
  ];

  if (loading && rows.length === 0) return <div className="p-8 text-slate-400">{t('common.loading')}</div>;

  return (
    <div>
      <PageHeader
        title={t('nav.damages')}
        actions={<button onClick={openNew} className="btn-primary flex items-center gap-1.5"><Plus size={16} />{t('damages.report')}</button>}
      />
      <p className="text-sm text-slate-500 mb-3 max-w-2xl">{t('damages.pageHint')}</p>

      <div className="flex items-center gap-2 mb-3">
        {['reported', 'cleared', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900' : 'bg-slate-100 dark:bg-navy-800 text-slate-500'}`}
          >
            {t(`damages.status_${s}`)}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        extraActions={(row) => row.status === 'reported' ? (
          <>
            <button onClick={() => setClearTarget(row)} title={t('damages.clear')} className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950 text-emerald-500">
              <CheckCircle2 size={15} />
            </button>
            <button onClick={() => setDeleteTarget(row)} title={t('common.delete')} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-500">
              <Trash2 size={15} />
            </button>
          </>
        ) : null}
        pageSize={25}
      />

      <SlideOver open={open} onClose={() => setOpen(false)} title={t('damages.report')} onSubmit={submit} submitting={saving}>
        <div>
          <label className="label">{t('items.item')}</label>
          <input
            type="text"
            placeholder={t('common.search')}
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            className="input mb-2"
          />
          <select required value={form.item_id} onChange={(e) => setForm((f) => ({ ...f, item_id: e.target.value, variant_id: '' }))} className="input">
            <option value="">{t('common.select')}</option>
            {filteredItems.map((i) => <option key={i.id} value={i.id}>{i.code} - {i.name_en}</option>)}
          </select>
        </div>

        {variants.length > 0 && (
          <div>
            <label className="label">{t('items.variant')}</label>
            <select value={form.variant_id} onChange={(e) => setForm((f) => ({ ...f, variant_id: e.target.value }))} className="input">
              <option value="">{t('items.noVariant')}</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label">{t('common.branch')}</label>
          <select value={form.branch_id} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))} className="input">
            <option value="">{t('branches.unbranchedPool')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
          </select>
        </div>

        <div>
          <label className="label">{t('common.qty')}</label>
          <input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} className="input" />
        </div>

        <div>
          <label className="label">{t('damages.type')}</label>
          <select value={form.damage_type} onChange={(e) => setForm((f) => ({ ...f, damage_type: e.target.value }))} className="input">
            {(damageTypes.length ? damageTypes : ['transport', 'warehouse', 'manufacturing_defect', 'customer_return', 'water_damage', 'other']).map((dt) => (
              <option key={dt} value={dt}>{t(`damages.type_${dt}`)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">{t('common.notes')}</label>
          <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input" rows={3} />
        </div>
      </SlideOver>

      <ConfirmDialog
        open={!!clearTarget}
        onCancel={() => setClearTarget(null)}
        onConfirm={clear}
        message={t('damages.confirmClear')}
        confirmLabel={t('damages.clear')}
        variant="primary"
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={remove}
        message={t('common.confirmDelete')}
        confirmLabel={t('common.delete')}
      />
    </div>
  );
}
