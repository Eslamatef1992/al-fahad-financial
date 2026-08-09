import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Printer, Download, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import usePermissions from '@/hooks/usePermissions';

const empty = {
  name_en: '', name_ar: '', category: '', unit: 'pcs',
  inventory_account_id: '', income_account_id: '', cogs_account_id: '',
  selling_price: 0, reorder_level: 0, opening_quantity: 0, opening_cost: 0,
};

export default function ItemsPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const [items, setItems] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ quantity_delta: '', unit_cost: '', notes: '' });
  const [adjusting, setAdjusting] = useState(false);

  const assetAccounts = accounts.filter((a) => !a.is_group && a.type === 'asset');
  const revenueAccounts = accounts.filter((a) => !a.is_group && a.type === 'revenue');
  const expenseAccounts = accounts.filter((a) => !a.is_group && a.type === 'expense');

  const load = () => {
    setLoading(true);
    api.get('/items', { params: showInactive ? { status: 'all' } : {} }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) { load(); api.get('/accounts').then((r) => setAccounts(r.data)); } }, [activeCompany, showInactive]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name_en: row.name_en, name_ar: row.name_ar, category: row.category || '', unit: row.unit,
      inventory_account_id: row.inventory_account_id, income_account_id: row.income_account_id, cogs_account_id: row.cogs_account_id,
      selling_price: row.selling_price, reorder_level: row.reorder_level, opening_quantity: 0, opening_cost: 0,
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/items/${editing.id}`, form);
      else await api.post('/items', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    await api.put(`/items/${row.id}`, { is_active: !row.is_active });
    toast.success(row.is_active ? t('common.deactivated') : t('common.activated'));
    load();
  };

  const openAdjust = (row) => { setAdjustItem(row); setAdjustForm({ quantity_delta: '', unit_cost: '', notes: '' }); };
  const submitAdjust = async (e) => {
    e.preventDefault(); setAdjusting(true);
    try {
      await api.post(`/items/${adjustItem.id}/adjust`, adjustForm);
      toast.success(t('items.stockAdjusted'));
      setAdjustItem(null); load();
    } finally { setAdjusting(false); }
  };

  const columns = [
    { key: 'code', label: t('common.code') },
    { key: 'name_en', label: t('common.nameEn') },
    { key: 'category', label: t('items.category'), render: (r) => r.category || '—' },
    { key: 'unit', label: t('items.unit') },
    { key: 'quantity_on_hand', label: t('items.stockOnHand'), render: (r) => (
      <span className={Number(r.quantity_on_hand) <= Number(r.reorder_level) ? 'text-red-500 font-semibold' : ''}>
        {Number(r.quantity_on_hand).toFixed(2)}
      </span>
    ) },
    { key: 'cost_price', label: t('items.avgCost'), render: (r) => Number(r.cost_price).toFixed(3) },
    { key: 'value', label: t('items.stockValue'), render: (r) => (Number(r.quantity_on_hand) * Number(r.cost_price)).toFixed(3) },
    { key: 'selling_price', label: t('items.sellingPrice'), render: (r) => Number(r.selling_price).toFixed(3) },
    { key: 'is_active', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {r.is_active ? t('common.active') : t('common.inactive')}
      </span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.items')}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => printFile('/items/pdf', {})} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
            <button onClick={() => downloadFile('/items/excel', {}, 'items.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
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
        extraActions={canDelete ? (row) => (
          <button onClick={() => openAdjust(row)} title={t('items.adjustStock')} className="p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950 text-amber-500">
            <SlidersHorizontal size={15} />
          </button>
        ) : undefined}
        pageSize={25}
      />

      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('common.code')}</label>
            <input disabled className="input opacity-60" value={editing ? editing.code : 'Auto-generated on save'} />
          </div>
          <div>
            <label className="label">{t('items.unit')}</label>
            <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, kg, box..." />
          </div>
        </div>
        <div><label className="label">{t('common.nameEn')}</label><input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
        <div><label className="label">{t('common.nameAr')}</label><input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        <div><label className="label">{t('items.category')}</label><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>

        <div>
          <label className="label">{t('items.inventoryAccount')}</label>
          <select required className="input" value={form.inventory_account_id} onChange={(e) => setForm({ ...form, inventory_account_id: e.target.value })}>
            <option value="">{t('common.select')}</option>
            {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">{t('items.inventoryAccountHint')}</p>
        </div>
        <div>
          <label className="label">{t('items.incomeAccount')}</label>
          <select required className="input" value={form.income_account_id} onChange={(e) => setForm({ ...form, income_account_id: e.target.value })}>
            <option value="">{t('common.select')}</option>
            {revenueAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('items.cogsAccount')}</label>
          <select required className="input" value={form.cogs_account_id} onChange={(e) => setForm({ ...form, cogs_account_id: e.target.value })}>
            <option value="">{t('common.select')}</option>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('items.sellingPrice')}</label><input type="number" step="0.001" className="input" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} /></div>
          <div><label className="label">{t('items.reorderLevel')}</label><input type="number" step="0.001" className="input" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></div>
        </div>
        {!editing && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{t('items.openingQuantity')}</label><input type="number" step="0.001" className="input" value={form.opening_quantity} onChange={(e) => setForm({ ...form, opening_quantity: e.target.value })} /></div>
            <div><label className="label">{t('items.openingCost')}</label><input type="number" step="0.001" className="input" value={form.opening_cost} onChange={(e) => setForm({ ...form, opening_cost: e.target.value })} /></div>
          </div>
        )}
      </SlideOver>

      <SlideOver open={!!adjustItem} onClose={() => setAdjustItem(null)} title={t('items.adjustStock')} onSubmit={submitAdjust} submitting={adjusting}>
        {adjustItem && (
          <>
            <p className="text-sm text-slate-500">{adjustItem.name_en} — {t('items.stockOnHand')}: <span className="font-semibold">{Number(adjustItem.quantity_on_hand).toFixed(2)} {adjustItem.unit}</span></p>
            <div>
              <label className="label">{t('items.quantityDelta')}</label>
              <input required type="number" step="0.001" className="input" value={adjustForm.quantity_delta} onChange={(e) => setAdjustForm({ ...adjustForm, quantity_delta: e.target.value })} />
              <p className="text-xs text-slate-400 mt-1">{t('items.quantityDeltaHint')}</p>
            </div>
            <div><label className="label">{t('items.unitCostOptional')}</label><input type="number" step="0.001" className="input" value={adjustForm.unit_cost} onChange={(e) => setAdjustForm({ ...adjustForm, unit_cost: e.target.value })} /></div>
            <div><label className="label">{t('common.notes')}</label><textarea className="input" rows={2} value={adjustForm.notes} onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })} /></div>
          </>
        )}
      </SlideOver>
    </div>
  );
}
