import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Printer, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import AccountPicker from '@/components/AccountPicker';
import usePermissions from '@/hooks/usePermissions';

const empty = { code: '', name_en: '', name_ar: '', phone: '', email: '', address: '', tax_no: '', credit_limit: 0, opening_balance: 0, parent_account_id: null };

export default function ClientsPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/clients', { params: showInactive ? { status: 'all' } : {} }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, showInactive]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...row, parent_account_id: row.account?.parent_id || null }); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/clients/${editing.id}`, form);
      else await api.post('/clients', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    await api.put(`/clients/${row.id}`, { is_active: !row.is_active });
    toast.success(row.is_active ? t('common.deactivated') : t('common.activated'));
    load();
  };

  const columns = [
    { key: 'code', label: t('common.code') },
    { key: 'name_en', label: t('common.nameEn') },
    { key: 'name_ar', label: t('common.nameAr') },
    { key: 'phone', label: t('common.phone') },
    { key: 'email', label: t('common.email') },
    { key: 'account', label: t('accounts.parentAccount'), render: (r) => r.account ? `${r.account.code} - ${r.account.name_en}` : '—' },
    { key: 'opening_balance', label: t('common.balance'), render: (r) => Number(r.opening_balance).toFixed(3) },
    { key: 'is_active', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {r.is_active ? t('common.active') : t('common.inactive')}
      </span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.clients')}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => printFile('/clients/pdf', {})} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
            <button onClick={() => downloadFile('/clients/excel', {}, 'clients.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
            {canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
          </div>
        }
      />
      <label className="flex items-center gap-2 text-sm text-slate-500 mb-3 cursor-pointer w-fit">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
        {t('common.showInactive')}
      </label>
      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        onEdit={canCreateEdit ? openEdit : undefined}
        onToggleActive={canDelete ? toggleActive : undefined}
        isInactive={(r) => !r.is_active}
        pageSize={25}
      />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('common.code')}</label>
            <input disabled className="input opacity-60" value={editing ? form.code : 'Auto-generated on save'} />
          </div>
          <div><label className="label">{t('common.taxNo')}</label><input className="input" value={form.tax_no || ''} onChange={(e) => setForm({ ...form, tax_no: e.target.value })} /></div>
        </div>
        <div><label className="label">{t('common.nameEn')}</label><input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
        <div><label className="label">{t('common.nameAr')}</label><input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('common.phone')}</label><input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">{t('common.email')}</label><input type="email" className="input" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        </div>
        <div><label className="label">{t('common.address')}</label><textarea className="input" rows={2} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('common.creditLimit')}</label><input type="number" step="0.001" className="input" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></div>
          <div><label className="label">{t('common.openingBalance')}</label><input type="number" step="0.001" className="input" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
        </div>
        <AccountPicker value={form.parent_account_id} onChange={(v) => setForm({ ...form, parent_account_id: v })} />
      </SlideOver>
    </div>
  );
}
