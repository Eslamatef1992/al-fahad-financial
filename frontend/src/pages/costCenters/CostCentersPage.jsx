import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Printer, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';
import AccountPicker from '@/components/AccountPicker';
import usePermissions from '@/hooks/usePermissions';
import CostCenterTreeNode from './CostCenterTreeNode';

const empty = { code: '', name_en: '', name_ar: '', parent_id: null, parent_account_id: null };

export default function CostCentersPage() {
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

  const load = () => { setLoading(true); api.get('/cost-centers/tree').then((r) => setTree(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const openNew = (parent = null) => { setEditing(null); setForm({ ...empty, parent_id: parent?.id || null }); setOpen(true); };
  const openEdit = (node) => { setEditing(node); setForm({ ...empty, ...node, parent_account_id: node.account?.parent_id || null }); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/cost-centers/${editing.id}`, form);
      else await api.post('/cost-centers', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const remove = async () => { await api.delete(`/cost-centers/${toDelete.id}`); toast.success('Deactivated'); setToDelete(null); load(); };

  return (
    <div>
      <PageHeader
        title={t('nav.costCenters')}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => printFile('/cost-centers/pdf', {})} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
            <button onClick={() => downloadFile('/cost-centers/excel', {}, 'cost-centers.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
            {canManageStructure && <button onClick={() => openNew(null)} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
          </div>
        }
      />
      <div className="card p-3">
        {loading ? <p className="text-center text-slate-400 py-10">{t('common.loading')}</p>
          : tree.length === 0 ? <p className="text-center text-slate-400 py-10">{t('common.noData')}</p>
          : tree.map((node) => <CostCenterTreeNode key={node.id} node={node} onAddChild={canManageStructure ? openNew : () => {}} onEdit={canManageStructure ? openEdit : () => {}} onDelete={canManageStructure ? setToDelete : () => {}} readOnly={!canManageStructure} />)}
      </div>
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div>
          <label className="label">{t('common.code')}</label>
          <input disabled className="input opacity-60" value={editing ? form.code : 'Auto-generated on save'} />
        </div>
        <div><label className="label">{t('common.nameEn')}</label><input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
        <div><label className="label">{t('common.nameAr')}</label><input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        <AccountPicker value={form.parent_account_id} onChange={(v) => setForm({ ...form, parent_account_id: v })} />
      </SlideOver>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={remove} />
    </div>
  );
}
