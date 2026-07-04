import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';
import usePermissions from '@/hooks/usePermissions';
import TreeNode from './TreeNode';

const TYPE_NORMAL = { asset: 'debit', expense: 'debit', liability: 'credit', equity: 'credit', revenue: 'credit' };
const empty = { code: '', name_en: '', name_ar: '', type: 'asset', normal_balance: 'debit', opening_balance: 0, currency: 'KWD', parent_id: null };

export default function ChartOfAccountsPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canManageStructure } = usePermissions();
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/accounts/tree').then((r) => setTree(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const openNew = (parent = null) => {
    setEditing(null);
    setForm({ ...empty, parent_id: parent?.id || null, type: parent?.type || 'asset', normal_balance: parent ? parent.normal_balance : 'debit' });
    setOpen(true);
  };
  const openEdit = (node) => { setEditing(node); setForm(node); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await api.put(`/accounts/${editing.id}`, form);
      else await api.post('/accounts', form);
      toast.success(t('common.save'));
      setOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const remove = async () => {
    await api.delete(`/accounts/${toDelete.id}`);
    toast.success(t('common.deactivated'));
    setToDelete(null);
    load();
  };

  const toggleActive = async (node) => {
    await api.put(`/accounts/${node.id}`, { is_active: !node.is_active });
    toast.success(node.is_active ? t('common.deactivated') : t('common.activated'));
    load();
  };

  return (
    <div>
      <PageHeader
        title={t('nav.chartOfAccounts')}
        subtitle={t('accounts.treeHint')}
        actions={canManageStructure && <button onClick={() => openNew(null)} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
      />

      <div className="card p-3">
        {loading ? (
          <p className="text-center text-slate-400 py-10">{t('common.loading')}</p>
        ) : !Array.isArray(tree) || tree.length === 0 ? (
          <p className="text-center text-slate-400 py-10">{t('common.noData')}</p>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              onAddChild={canManageStructure ? openNew : () => {}}
              onEdit={canManageStructure ? openEdit : () => {}}
              onDelete={canManageStructure ? setToDelete : () => {}}
              onToggleActive={canManageStructure ? toggleActive : undefined}
              readOnly={!canManageStructure}
            />
          ))
        )}
      </div>

      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : (form.parent_id ? t('accounts.addSubAccount') : t('accounts.addAccount'))} onSubmit={submit} submitting={saving}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('common.code')}</label><input required className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div>
            <label className="label">{t('common.type')}</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, normal_balance: TYPE_NORMAL[e.target.value] })}>
              {Object.keys(TYPE_NORMAL).map((tp) => <option key={tp} value={tp}>{t(`accounts.${tp}`)}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">{t('common.nameEn')}</label><input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
        <div><label className="label">{t('common.nameAr')}</label><input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('common.openingBalance')}</label><input type="number" step="0.001" className="input" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
          <div><label className="label">{t('common.currency')}</label><input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
        </div>
        {form.parent_id && <p className="text-xs text-slate-400">{t('accounts.subAccountNote')}</p>}
      </SlideOver>

      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={remove} />
    </div>
  );
}
