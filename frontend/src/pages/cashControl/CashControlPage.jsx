import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Printer, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';
import usePermissions from '@/hooks/usePermissions';

const empty = { name_en: '', name_ar: '', type: 'cash', account_id: '', bank_name: '', iban: '', currency: 'KWD' };

export default function CashControlPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const [items, setItems] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/cash-accounts'), api.get('/accounts')])
      .then(([c, a]) => { setItems(c.data); setAccounts(a.data.filter((x) => x.type === 'asset' && !x.is_group)); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm(row); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/cash-accounts/${editing.id}`, form);
      else await api.post('/cash-accounts', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };
  const remove = async () => { await api.delete(`/cash-accounts/${toDelete.id}`); toast.success('Deactivated'); setToDelete(null); load(); };

  const columns = [
    { key: 'name_en', label: t('common.nameEn') },
    { key: 'type', label: 'Type', render: (r) => <span className="capitalize">{r.type.replace('_', ' ')}</span> },
    { key: 'account', label: 'Linked Account', render: (r) => r.account ? `${r.account.code} - ${r.account.name_en}` : '—' },
    { key: 'bank_name', label: 'Bank' },
    { key: 'currency', label: 'Currency' },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.cashControl')}
        subtitle="Cash, petty cash and bank accounts"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => printFile('/cash-accounts/pdf', {})} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
            <button onClick={() => downloadFile('/cash-accounts/excel', {}, 'cash-control.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
            {canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
          </div>
        }
      />
      <DataTable columns={columns} data={items} loading={loading} onEdit={canCreateEdit ? openEdit : undefined} onDelete={canDelete ? setToDelete : undefined} pageSize={25} />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('common.nameEn')}</label><input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
          <div><label className="label">{t('common.nameAr')}</label><input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="cash">Cash</option><option value="bank">Bank</option><option value="petty_cash">Petty Cash</option>
            </select>
          </div>
          <div>
            <label className="label">Linked GL Account</label>
            <select required className="input" value={form.account_id || ''} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
            </select>
          </div>
        </div>
        {form.type === 'bank' && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Bank Name</label><input className="input" value={form.bank_name || ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
            <div><label className="label">IBAN</label><input className="input" value={form.iban || ''} onChange={(e) => setForm({ ...form, iban: e.target.value })} /></div>
          </div>
        )}
        <div><label className="label">Currency</label><input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
      </SlideOver>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={remove} />
    </div>
  );
}
