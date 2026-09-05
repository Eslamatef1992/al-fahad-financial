import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Printer, Download, SlidersHorizontal, Layers, Tags, X, Upload, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, printFile, fileUrl } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import usePermissions from '@/hooks/usePermissions';
import useFinancialDefaults from '@/hooks/useFinancialDefaults';

const empty = {
  name_en: '', name_ar: '', category_id: '', unit: 'pcs', unit_id: '', sku: '', variant_attributes: [],
  inventory_account_id: '', income_account_id: '', cogs_account_id: '',
  selling_price: 0, reorder_level: 0, opening_quantity: 0, opening_cost: 0,
};

const emptyVariant = { sku: '', attributes: {}, opening_quantity: 0, opening_cost: 0 };

export default function ItemsPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const financialDefaults = useFinancialDefaults();
  const [items, setItems] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [units, setUnits] = useState([]);
  const [newUnitName, setNewUnitName] = useState('');
  const [addingUnit, setAddingUnit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [bookedOnly, setBookedOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [attrInput, setAttrInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ quantity_delta: '', unit_cost: '', notes: '', branch_id: '', variant_id: '' });
  const [adjusting, setAdjusting] = useState(false);
  const [stockItem, setStockItem] = useState(null);
  const [stockBreakdown, setStockBreakdown] = useState(null);
  const [adjustVariants, setAdjustVariants] = useState([]);
  const [variantsItem, setVariantsItem] = useState(null);
  const [variants, setVariants] = useState([]);
  const [variantForm, setVariantForm] = useState(emptyVariant);
  const [savingVariant, setSavingVariant] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const assetAccounts = accounts.filter((a) => !a.is_group && a.type === 'asset');
  const revenueAccounts = accounts.filter((a) => !a.is_group && a.type === 'revenue');
  const expenseAccounts = accounts.filter((a) => !a.is_group && a.type === 'expense');

  const load = () => {
    setLoading(true);
    const params = { ...(showInactive ? { status: 'all' } : {}) };
    if (filterBranch) params.branch_id = filterBranch;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    api.get('/items', { params }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  const loadCategories = () => api.get('/item-categories').then((r) => setCategories(r.data));
  const loadUnits = () => api.get('/units').then((r) => setUnits(r.data));
  useEffect(() => {
    if (activeCompany) {
      load();
      api.get('/accounts').then((r) => setAccounts(r.data));
      api.get('/branches').then((r) => setBranches(r.data));
      loadCategories();
      loadUnits();
    }
  }, [activeCompany, showInactive, filterBranch, dateFrom, dateTo]);

  const exportParams = () => {
    const params = {};
    if (filterCategory) params.category_id = filterCategory;
    if (filterUnit) params.unit_id = filterUnit;
    if (filterBranch) params.branch_id = filterBranch;
    if (lowStockOnly) params.low_stock = 'true';
    if (bookedOnly) params.booked_only = 'true';
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (showInactive) params.status = 'all';
    return params;
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      ...empty,
      inventory_account_id: financialDefaults.item_inventory_account_id || '',
      income_account_id: financialDefaults.item_income_account_id || '',
      cogs_account_id: financialDefaults.item_cogs_account_id || '',
    });
    setAttrInput(''); setNewCategoryName(''); setNewUnitName(''); setOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name_en: row.name_en, name_ar: row.name_ar, category_id: row.category_id || '', unit: row.unit, unit_id: row.unit_id || '',
      sku: row.sku || '', variant_attributes: row.variant_attributes || [],
      inventory_account_id: row.inventory_account_id, income_account_id: row.income_account_id, cogs_account_id: row.cogs_account_id,
      selling_price: row.selling_price, reorder_level: row.reorder_level, opening_quantity: 0, opening_cost: 0,
    });
    setAttrInput('');
    setNewCategoryName('');
    setNewUnitName('');
    setOpen(true);
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setAddingCategory(true);
    try {
      const { data } = await api.post('/item-categories', { name_en: name });
      setCategories((prev) => [...prev, data].sort((a, b) => a.name_en.localeCompare(b.name_en)));
      setForm((f) => ({ ...f, category_id: data.id }));
      setNewCategoryName('');
      toast.success(t('common.save'));
    } finally { setAddingCategory(false); }
  };

  const selectUnit = (unitId) => {
    const chosen = units.find((u) => u.id === unitId);
    setForm((f) => ({ ...f, unit_id: unitId, unit: chosen ? chosen.name_en : f.unit }));
  };
  const addUnit = async () => {
    const name = newUnitName.trim();
    if (!name) return;
    setAddingUnit(true);
    try {
      const { data } = await api.post('/units', { name_en: name });
      setUnits((prev) => [...prev, data].sort((a, b) => a.name_en.localeCompare(b.name_en)));
      setForm((f) => ({ ...f, unit_id: data.id, unit: data.name_en }));
      setNewUnitName('');
      toast.success(t('common.save'));
    } finally { setAddingUnit(false); }
  };

  const addAttrName = () => {
    const name = attrInput.trim();
    if (!name || form.variant_attributes.includes(name)) return;
    setForm({ ...form, variant_attributes: [...form.variant_attributes, name] });
    setAttrInput('');
  };
  const removeAttrName = (name) => setForm({ ...form, variant_attributes: form.variant_attributes.filter((a) => a !== name) });

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/items/${editing.id}`, form);
      else await api.post('/items', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/items/${editing.id}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEditing(data);
      toast.success(t('common.save'));
      load();
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };
  const removeImage = async () => {
    if (!editing) return;
    setUploadingImage(true);
    try {
      const { data } = await api.delete(`/items/${editing.id}/image`);
      setEditing(data);
      toast.success(t('common.save'));
      load();
    } finally { setUploadingImage(false); }
  };

  const toggleActive = async (row) => {
    await api.put(`/items/${row.id}`, { is_active: !row.is_active });
    toast.success(row.is_active ? t('common.deactivated') : t('common.activated'));
    load();
  };

  const openAdjust = (row) => {
    setAdjustItem(row);
    setAdjustForm({ quantity_delta: '', unit_cost: '', notes: '', branch_id: '', variant_id: '' });
    setAdjustVariants([]);
    if (row.variant_count > 0) api.get(`/items/${row.id}/variants`).then((r) => setAdjustVariants(r.data.filter((v) => v.is_active)));
  };
  const submitAdjust = async (e) => {
    e.preventDefault(); setAdjusting(true);
    try {
      await api.post(`/items/${adjustItem.id}/adjust`, adjustForm);
      toast.success(t('items.stockAdjusted'));
      setAdjustItem(null); load();
    } finally { setAdjusting(false); }
  };

  const openStock = (row) => {
    setStockItem(row);
    setStockBreakdown(null);
    api.get(`/items/${row.id}/stock`).then((r) => setStockBreakdown(r.data));
  };

  const openVariants = (row) => {
    setVariantsItem(row);
    setVariants([]);
    setVariantForm(emptyVariant);
    api.get(`/items/${row.id}/variants`).then((r) => setVariants(r.data));
  };
  const reloadVariants = () => {
    api.get(`/items/${variantsItem.id}/variants`).then((r) => setVariants(r.data));
    load();
  };
  const submitVariant = async (e) => {
    e.preventDefault(); setSavingVariant(true);
    try {
      await api.post(`/items/${variantsItem.id}/variants`, variantForm);
      toast.success(t('common.save'));
      setVariantForm(emptyVariant);
      reloadVariants();
    } finally { setSavingVariant(false); }
  };
  const toggleVariantActive = async (variant) => {
    if (variant.is_active) {
      await api.delete(`/items/${variantsItem.id}/variants/${variant.id}`);
    } else {
      await api.put(`/items/${variantsItem.id}/variants/${variant.id}`, { is_active: true });
    }
    toast.success(t('common.save'));
    reloadVariants();
  };

  const columns = [
    { key: 'image_url', label: t('items.image'), render: (r) => r.image_url ? (
      <img src={fileUrl(r.image_url)} alt="" className="w-8 h-8 rounded-lg object-cover" />
    ) : <span className="text-slate-300">—</span> },
    { key: 'code', label: t('common.code') },
    { key: 'sku', label: t('items.sku'), render: (r) => r.sku || '—' },
    { key: 'name_en', label: t('common.nameEn') },
    { key: 'category', label: t('items.category'), render: (r) => r.category_name || '—' },
    { key: 'unit', label: t('items.unit'), render: (r) => (
      <span title={r.unit_conversion || undefined}>{r.unit_name || r.unit}</span>
    ) },
    { key: 'variants', label: t('items.variants'), render: (r) => (r.variant_count > 0 ? `${r.variant_count} ${t('items.variantsCount')}` : '—') },
    { key: 'quantity_on_hand', label: t('items.stockOnHand'), render: (r) => {
      const total = Number(r.total_quantity_on_hand ?? r.quantity_on_hand);
      return (
        <span className={total <= Number(r.reorder_level) && Number(r.reorder_level) > 0 ? 'text-red-500 font-semibold' : ''}>
          {total.toFixed(2)}
          {(Number(r.branch_quantity_on_hand) > 0 || Number(r.variant_quantity_on_hand) > 0) && <span className="text-xs text-slate-400 font-normal"> ({t('branches.stock')})</span>}
        </span>
      );
    } },
    { key: 'booked_quantity', label: t('items.booked'), render: (r) => (
      Number(r.booked_quantity) > 0
        ? <span className="text-amber-600 font-medium">{Number(r.booked_quantity).toFixed(2)}</span>
        : <span className="text-slate-300">—</span>
    ) },
    { key: 'available_quantity', label: t('items.available'), render: (r) => Number(r.available_quantity ?? r.total_quantity_on_hand).toFixed(2) },
    { key: 'value', label: t('items.stockValue'), render: (r) => Number(r.total_value ?? (Number(r.quantity_on_hand) * Number(r.cost_price))).toFixed(3) },
    { key: 'selling_price', label: t('items.sellingPrice'), render: (r) => Number(r.selling_price).toFixed(3) },
    { key: 'is_active', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {r.is_active ? t('common.active') : t('common.inactive')}
      </span>
    ) },
  ];

  const filteredItems = useMemo(() => items.filter((r) => {
    if (filterCategory && r.category_id !== filterCategory) return false;
    if (filterUnit && r.unit_id !== filterUnit) return false;
    if (lowStockOnly) {
      const total = Number(r.total_quantity_on_hand ?? r.quantity_on_hand);
      if (!(Number(r.reorder_level) > 0 && total <= Number(r.reorder_level))) return false;
    }
    if (bookedOnly && !(Number(r.booked_quantity) > 0)) return false;
    return true;
  }), [items, filterCategory, filterUnit, lowStockOnly, bookedOnly]);

  return (
    <div>
      <PageHeader
        title={t('nav.items')}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => printFile('/items/pdf', exportParams())} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
            <button onClick={() => downloadFile('/items/excel', exportParams(), 'items.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
            {canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer w-fit">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
          {t('common.showInactive')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer w-fit">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} className="rounded" />
          {t('items.lowStockOnly')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer w-fit">
          <input type="checkbox" checked={bookedOnly} onChange={(e) => setBookedOnly(e.target.checked)} className="rounded" />
          {t('items.bookedOnly')}
        </label>
        <select className="input !py-1.5 !w-auto text-sm" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">{t('items.allCategories')}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
        </select>
        <select className="input !py-1.5 !w-auto text-sm" value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
          <option value="">{t('items.allUnits')}</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name_en}</option>)}
        </select>
        <select className="input !py-1.5 !w-auto text-sm" value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
          <option value="">{t('items.allBranches')}</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <input type="date" className="input !py-1.5 !w-auto text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title={t('items.addedFrom')} />
          <span className="text-slate-400 text-sm">{t('common.to')}</span>
          <input type="date" className="input !py-1.5 !w-auto text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title={t('items.addedTo')} />
        </div>
      </div>
      {filterBranch && (
        <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 rounded-lg px-3 py-2 mb-3 w-fit">{t('items.branchFilterHint')}</p>
      )}
      <DataTable
        columns={columns}
        data={filteredItems}
        loading={loading}
        onEdit={canCreateEdit ? openEdit : undefined}
        onToggleActive={canDelete ? toggleActive : undefined}
        isInactive={(r) => !r.is_active}
        extraActions={(row) => (
          <>
            <button onClick={() => openVariants(row)} title={t('items.variants')} className="p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950 text-purple-500">
              <Tags size={15} />
            </button>
            <button onClick={() => openStock(row)} title={t('branches.stock')} className="p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 text-blue-500">
              <Layers size={15} />
            </button>
            {canDelete && (
              <button onClick={() => openAdjust(row)} title={t('items.adjustStock')} className="p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950 text-amber-500">
                <SlidersHorizontal size={15} />
              </button>
            )}
          </>
        )}
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
            <select className="input" value={form.unit_id} onChange={(e) => selectUnit(e.target.value)}>
              <option value="">{t('common.select')}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name_en}{u.base_unit_id ? ` (1 = ${Number(u.conversion_factor)} ${u.baseUnit?.name_en || ''})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">{t('items.addUnit')}</label>
          <div className="flex gap-2">
            <input
              className="input"
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUnit(); } }}
              placeholder={t('items.newUnitPlaceholder')}
            />
            <button type="button" onClick={addUnit} disabled={addingUnit || !newUnitName.trim()} className="btn-ghost shrink-0">{t('common.add')}</button>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('items.addUnitHint')}</p>
        </div>
        <div><label className="label">{t('common.nameEn')}</label><input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
        <div><label className="label">{t('common.nameAr')}</label><input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>

        <div>
          <label className="label">{t('items.image')}</label>
          {editing ? (
            <div className="flex items-center gap-3">
              {editing.image_url ? (
                <img src={fileUrl(editing.image_url)} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-navy-700" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-400 text-xs">{t('common.none')}</div>
              )}
              <label className="btn-ghost cursor-pointer !py-1.5">
                <Upload size={14} /> {uploadingImage ? t('common.loading') : (editing.image_url ? t('items.replaceImage') : t('items.uploadImage'))}
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" disabled={uploadingImage} onChange={uploadImage} />
              </label>
              {editing.image_url && (
                <button type="button" onClick={removeImage} disabled={uploadingImage} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-500"><Trash2 size={15} /></button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">{t('items.imageHint')}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('items.category')}</label>
            <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">{t('common.none')}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('items.sku')}</label>
            <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder={t('items.skuPlaceholder')} />
          </div>
        </div>
        <div>
          <label className="label">{t('items.addCategory')}</label>
          <div className="flex gap-2">
            <input
              className="input"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
              placeholder={t('items.newCategoryPlaceholder')}
            />
            <button type="button" onClick={addCategory} disabled={addingCategory || !newCategoryName.trim()} className="btn-ghost shrink-0">{t('common.add')}</button>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('items.addCategoryHint')}</p>
        </div>

        <div>
          <label className="label">{t('items.variantAttributes')}</label>
          <div className="flex gap-2">
            <input
              className="input"
              value={attrInput}
              onChange={(e) => setAttrInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttrName(); } }}
              placeholder={t('items.variantAttributesPlaceholder')}
            />
            <button type="button" onClick={addAttrName} className="btn-ghost shrink-0">{t('common.add')}</button>
          </div>
          {form.variant_attributes.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {form.variant_attributes.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 text-xs font-medium">
                  {a}
                  <button type="button" onClick={() => removeAttrName(a)}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">{t('items.variantAttributesHint')}</p>
        </div>

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
        {!editing && form.variant_attributes.length === 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{t('items.openingQuantity')}</label><input type="number" step="0.001" className="input" value={form.opening_quantity} onChange={(e) => setForm({ ...form, opening_quantity: e.target.value })} /></div>
            <div><label className="label">{t('items.openingCost')}</label><input type="number" step="0.001" className="input" value={form.opening_cost} onChange={(e) => setForm({ ...form, opening_cost: e.target.value })} /></div>
          </div>
        )}
        {form.variant_attributes.length > 0 && (
          <p className="text-xs text-slate-400">{t('items.variantsOpeningHint')}</p>
        )}
      </SlideOver>

      <SlideOver open={!!adjustItem} onClose={() => setAdjustItem(null)} title={t('items.adjustStock')} onSubmit={submitAdjust} submitting={adjusting}>
        {adjustItem && (
          <>
            <p className="text-sm text-slate-500">{adjustItem.name_en} — {t('items.stockOnHand')}: <span className="font-semibold">{Number(adjustItem.total_quantity_on_hand ?? adjustItem.quantity_on_hand).toFixed(2)} {adjustItem.unit}</span></p>
            {adjustItem.variant_count > 0 && (
              <div>
                <label className="label">{t('items.variant')}</label>
                <select className="input" value={adjustForm.variant_id} onChange={(e) => setAdjustForm({ ...adjustForm, variant_id: e.target.value })}>
                  <option value="">{t('common.none')}</option>
                  {adjustVariants.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">{t('items.adjustVariantHint')}</p>
              </div>
            )}
            <div>
              <label className="label">{t('common.branch')}</label>
              <select className="input" value={adjustForm.branch_id} onChange={(e) => setAdjustForm({ ...adjustForm, branch_id: e.target.value })}>
                <option value="">{t('branches.unbranchedPool')}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">{t('items.adjustBranchHint')}</p>
            </div>
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

      <SlideOver open={!!stockItem} onClose={() => setStockItem(null)} title={t('branches.stock')}>
        {stockItem && (
          <>
            <p className="text-sm text-slate-500 mb-2">{stockItem.name_en}</p>
            {!stockBreakdown && <p className="text-sm text-slate-400">{t('common.loading')}</p>}
            {stockBreakdown && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-navy-800/50 text-sm">
                    <span className="font-medium">{t('branches.unbranchedPool')}</span>
                    <span className="font-semibold">{stockBreakdown.unbranched.quantity_on_hand.toFixed(2)} {stockItem.unit}</span>
                  </div>
                  {stockBreakdown.branches.map((b) => (
                    <div key={b.branch_id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-navy-800/50 text-sm">
                      <span className="font-medium">{b.branch ? `${b.branch.code} - ${b.branch.name_en}` : b.branch_id}</span>
                      <span className="font-semibold">{b.quantity_on_hand.toFixed(2)} {stockItem.unit}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-navy-50 dark:bg-navy-900/50 text-sm border-t border-slate-200 dark:border-navy-700 mt-3 pt-3">
                    <span className="font-bold">{t('common.total')}</span>
                    <span className="font-bold">{stockBreakdown.total_quantity_on_hand.toFixed(2)} {stockItem.unit}</span>
                  </div>
                </div>
                {stockBreakdown.variants?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('items.variants')}</p>
                    <div className="space-y-3">
                      {stockBreakdown.variants.map((v) => (
                        <div key={v.variant_id} className="rounded-xl border border-slate-200 dark:border-navy-700 p-3">
                          <p className="text-sm font-semibold mb-1">
                            {v.sku}
                            <span className="text-xs text-slate-400 font-normal ml-2">
                              {Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(', ')}
                            </span>
                          </p>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{t('branches.unbranchedPool')}</span>
                            <span>{v.unbranched.quantity_on_hand.toFixed(2)}</span>
                          </div>
                          {v.branches.map((b) => (
                            <div key={b.branch_id} className="flex items-center justify-between text-xs text-slate-500">
                              <span>{b.branch ? `${b.branch.code} - ${b.branch.name_en}` : b.branch_id}</span>
                              <span>{b.quantity_on_hand.toFixed(2)}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between text-xs font-semibold mt-1 pt-1 border-t border-slate-100 dark:border-navy-700">
                            <span>{t('common.total')}</span>
                            <span>{v.total_quantity_on_hand.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </SlideOver>

      <SlideOver open={!!variantsItem} onClose={() => setVariantsItem(null)} title={t('items.manageVariants')} onSubmit={submitVariant} submitting={savingVariant}>
        {variantsItem && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{variantsItem.name_en}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => printFile(`/items/${variantsItem.id}/variants/pdf`, {})} className="btn-ghost text-xs"><Printer size={13} /></button>
                <button type="button" onClick={() => downloadFile(`/items/${variantsItem.id}/variants/excel`, {}, 'variants.xlsx')} className="btn-ghost text-xs"><Download size={13} /></button>
              </div>
            </div>

            {(variantsItem.variant_attributes || []).length === 0 && (
              <p className="text-xs text-amber-500 bg-amber-50 dark:bg-amber-950 rounded-lg p-2">{t('items.noAttributesHint')}</p>
            )}

            {variants.length > 0 && (
              <div className="space-y-2">
                {variants.map((v) => (
                  <div key={v.id} className={`flex items-center justify-between p-2.5 rounded-xl text-sm ${v.is_active ? 'bg-slate-50 dark:bg-navy-800/50' : 'bg-slate-50/50 dark:bg-navy-800/20 opacity-60'}`}>
                    <div>
                      <p className="font-semibold">{v.sku}</p>
                      <p className="text-xs text-slate-400">{Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(', ')} · {Number(v.quantity_on_hand).toFixed(2)} {variantsItem.unit}</p>
                    </div>
                    <button type="button" onClick={() => toggleVariantActive(v)} className="text-xs font-medium text-blue-500 hover:underline">
                      {v.is_active ? t('common.deactivate') : t('common.activate')}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-slate-200 dark:border-navy-700 pt-3 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase">{t('items.addVariant')}</p>
              <div><label className="label">{t('items.sku')}</label><input required className="input" value={variantForm.sku} onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })} /></div>
              {(variantsItem.variant_attributes || []).map((attrName) => (
                <div key={attrName}>
                  <label className="label">{attrName}</label>
                  <input
                    className="input"
                    value={variantForm.attributes[attrName] || ''}
                    onChange={(e) => setVariantForm({ ...variantForm, attributes: { ...variantForm.attributes, [attrName]: e.target.value } })}
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{t('items.openingQuantity')}</label><input type="number" step="0.001" className="input" value={variantForm.opening_quantity} onChange={(e) => setVariantForm({ ...variantForm, opening_quantity: e.target.value })} /></div>
                <div><label className="label">{t('items.openingCost')}</label><input type="number" step="0.001" className="input" value={variantForm.opening_cost} onChange={(e) => setVariantForm({ ...variantForm, opening_cost: e.target.value })} /></div>
              </div>
            </div>
          </>
        )}
      </SlideOver>
    </div>
  );
}
