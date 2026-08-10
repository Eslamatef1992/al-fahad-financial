import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import usePermissions from '@/hooks/usePermissions';

const empty = {
  code: '', description: '', type: 'percentage', value: '', scope: 'invoice',
  expiry_date: '', max_redemptions: '', min_invoice_amount: '',
};

export default function DiscountCodesPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/discount-codes', { params: showInactive ? { status: 'all' } : {} }).then((r) => setCodes(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, showInactive]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      code: row.code, description: row.description || '', type: row.type, value: row.value, scope: row.scope,
      expiry_date: row.expiry_date || '', max_redemptions: row.max_redemptions ?? '', min_invoice_amount: row.min_invoice_amount ?? '',
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/discount-codes/${editing.id}`, form);
      else await api.post('/discount-codes', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    await api.put(`/discount-codes/${row.id}`, { is_active: !row.is_active });
    toast.success(row.is_active ? t('common.deactivated') : t('common.activated'));
    load();
  };

  const columns = [
    { key: 'code', label: t('discountCodes.code'), render: (r) => <span className="font-mono font-semibold">{r.code}</span> },
    { key: 'description', label: t('common.description'), render: (r) => r.description || '—' },
    { key: 'value', label: t('discountCodes.discount'), render: (r) => (r.type === 'percentage' ? `${Number(r.value).toFixed(2)}%` : Number(r.value).toFixed(3)) },
    { key: 'scope', label: t('discountCodes.scope'), render: (r) => t(`discountCodes.scope_${r.scope}`) },
    { key: 'used_count', label: t('discountCodes.usage'), render: (r) => (r.max_redemptions ? `${r.used_count} / ${r.max_redemptions}` : `${r.used_count} (${t('discountCodes.unlimited')})`) },
    { key: 'min_invoice_amount', label: t('discountCodes.minAmount'), render: (r) => (r.min_invoice_amount ? Number(r.min_invoice_amount).toFixed(3) : '—') },
    { key: 'expiry_date', label: t('discountCodes.expiry'), render: (r) => r.expiry_date || t('discountCodes.noExpiry') },
    { key: 'is_active', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {r.is_active ? t('common.active') : t('common.inactive')}
      </span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.discountCodes')}
        actions={canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
      />
      <label className="flex items-center gap-2 text-sm text-slate-500 mb-3 cursor-pointer w-fit">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
        {t('common.showInactive')}
      </label>
      <DataTable
        columns={columns}
        data={codes}
        loading={loading}
        onEdit={canCreateEdit ? openEdit : undefined}
        onToggleActive={canDelete ? toggleActive : undefined}
        isInactive={(r) => !r.is_active}
        pageSize={25}
      />

      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div>
          <label className="label">{t('discountCodes.code')}</label>
          <input required className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE10" />
        </div>
        <div>
          <label className="label">{t('common.description')}</label>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('discountCodes.type')}</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="percentage">{t('discountCodes.percentage')}</option>
              <option value="fixed">{t('discountCodes.fixed')}</option>
            </select>
          </div>
          <div>
            <label className="label">{form.type === 'percentage' ? t('discountCodes.valuePercent') : t('discountCodes.valueAmount')}</label>
            <input required type="number" step="0.001" min="0" max={form.type === 'percentage' ? 100 : undefined} className="input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">{t('discountCodes.scope')}</label>
          <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
            <option value="invoice">{t('discountCodes.scope_invoice')}</option>
            <option value="line">{t('discountCodes.scope_line')}</option>
          </select>
          <p className="text-xs text-slate-400 mt-1">{t('discountCodes.scopeHint')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('discountCodes.expiry')}</label>
            <input type="date" className="input" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('discountCodes.maxRedemptions')}</label>
            <input type="number" step="1" min="0" className="input" value={form.max_redemptions} onChange={(e) => setForm({ ...form, max_redemptions: e.target.value })} placeholder={t('discountCodes.unlimited')} />
          </div>
        </div>
        <div>
          <label className="label">{t('discountCodes.minAmount')}</label>
          <input type="number" step="0.001" min="0" className="input" value={form.min_invoice_amount} onChange={(e) => setForm({ ...form, min_invoice_amount: e.target.value })} placeholder={t('discountCodes.noMinimum')} />
        </div>
      </SlideOver>
    </div>
  );
}
