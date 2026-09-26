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

const empty = { name_en: '', name_ar: '', account_id: '' };

// Super-admin-only: defines the ways a payment can be tendered (Cash, Knet,
// Tabby, Bank Transfer, ...), each linked to exactly one Chart-of-Accounts
// account it settles into. This list drives the payment options shown at
// POS checkout and on the invoice "Record Payment" form — see PosPage.jsx
// and InvoiceDetailPage.jsx.
export default function PaymentMethodsPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { isSuperAdmin } = usePermissions();
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/payment-methods', { params: showInactive ? { status: 'all' } : {} }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!activeCompany) return;
    load();
    api.get('/accounts').then((r) => setAccounts(r.data)).catch(() => {});
  }, [activeCompany, showInactive]);

  const sortedAccounts = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({ name_en: row.name_en, name_ar: row.name_ar || '', account_id: row.account_id || '' });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/payment-methods/${editing.id}`, form);
      else await api.post('/payment-methods', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    await api.put(`/payment-methods/${row.id}`, { is_active: !row.is_active });
    toast.success(row.is_active ? t('common.deactivated') : t('common.activated'));
    load();
  };

  const columns = [
    { key: 'name_en', label: t('common.nameEn'), render: (r) => <span className="font-semibold">{r.name_en}</span> },
    { key: 'name_ar', label: t('common.nameAr'), render: (r) => r.name_ar || '—' },
    { key: 'account', label: t('paymentMethods.linkedAccount'), render: (r) => r.account ? `${r.account.code} - ${r.account.name_en}` : '—' },
    { key: 'is_active', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {r.is_active ? t('common.active') : t('common.inactive')}
      </span>
    ) },
  ];

  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title={t('nav.paymentMethods')} />
        <p className="text-sm text-slate-500">{t('paymentMethods.superAdminOnly')}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('nav.paymentMethods')}
        subtitle={t('paymentMethods.pageHint')}
        actions={<button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
      />
      <label className="flex items-center gap-2 text-sm text-slate-500 mb-3 cursor-pointer w-fit">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
        {t('common.showInactive')}
      </label>
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        onEdit={openEdit}
        onToggleActive={toggleActive}
        isInactive={(r) => !r.is_active}
        pageSize={25}
      />

      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div>
          <label className="label">{t('common.nameEn')}</label>
          <input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('common.nameAr')}</label>
          <input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('paymentMethods.linkedAccount')}</label>
          <select required className="input" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">{t('common.select')}</option>
            {sortedAccounts.map((a) => (
              <option key={a.id} value={a.id}>{'— '.repeat(Math.max(0, a.level - 1))}{a.code} - {a.name_en}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">{t('paymentMethods.linkedAccountHint')}</p>
        </div>
      </SlideOver>
    </div>
  );
}
