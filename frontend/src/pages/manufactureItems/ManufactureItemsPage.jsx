import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Layers, Hammer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import usePermissions from '@/hooks/usePermissions';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';

const emptyItem = (categoryId = '') => ({
  category_id: categoryId, name_en: '', name_ar: '', color: '', size: '', height: '', length: '', dimension_unit: 'cm',
  selling_price: '', manufacturer_cost_price: '', manufacturer_id: '', is_active: true,
});
const n3 = (v) => Number(v || 0).toFixed(3);

// Catalog of made-to-order products used by POS "Manufacture Orders". Anyone can
// browse it; only a super admin creates/edits (it holds manufacturer cost prices).
export default function ManufactureItemsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { isSuperAdmin } = usePermissions();

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState(''); // '' = all
  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ id: null, name_en: '', name_ar: '', is_active: true });
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyItem());
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/manufacture-catalog/categories', { params: { status: 'all' } }),
      api.get('/manufacture-catalog/items', { params: { status: 'all' } }),
    ]).then(([c, i]) => { setCategories(c.data); setItems(i.data); }).finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!activeCompany) return;
    load();
    api.get('/manufacturers').then((r) => setManufacturers(r.data)).catch(() => {});
  }, [activeCompany]);

  const catName = (id) => { const c = categories.find((x) => x.id === id); return c ? (isAr ? c.name_ar || c.name_en : c.name_en) : '—'; };
  const shown = useMemo(() => items.filter((i) => !activeCat || i.category_id === activeCat), [items, activeCat]);

  const openNewCat = () => { setCatForm({ id: null, name_en: '', name_ar: '', is_active: true }); setCatOpen(true); };
  const openEditCat = (c) => { setCatForm({ id: c.id, name_en: c.name_en, name_ar: c.name_ar, is_active: c.is_active }); setCatOpen(true); };
  const saveCat = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (catForm.id) await api.put(`/manufacture-catalog/categories/${catForm.id}`, catForm);
      else await api.post('/manufacture-catalog/categories', catForm);
      toast.success(L('Saved', 'تم الحفظ')); setCatOpen(false); load();
    } finally { setSaving(false); }
  };

  const openNewItem = () => { setEditing(null); setForm(emptyItem(activeCat || categories.find((c) => c.is_active)?.id || '')); setItemOpen(true); };
  const openEditItem = (r) => {
    setEditing(r);
    setForm({
      category_id: r.category_id, name_en: r.name_en, name_ar: r.name_ar, color: r.color || '', size: r.size || '',
      height: r.height ?? '', length: r.length ?? '', dimension_unit: r.dimension_unit || 'cm',
      selling_price: r.selling_price, manufacturer_cost_price: r.manufacturer_cost_price, manufacturer_id: r.manufacturer_id || '', is_active: r.is_active,
    });
    setItemOpen(true);
  };
  const saveItem = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/manufacture-catalog/items/${editing.id}`, form);
      else await api.post('/manufacture-catalog/items', form);
      toast.success(L('Saved', 'تم الحفظ')); setItemOpen(false); load();
    } finally { setSaving(false); }
  };
  const toggleActive = async (r) => { await api.put(`/manufacture-catalog/items/${r.id}`, { is_active: !r.is_active }); load(); };

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const margin = Number(form.selling_price || 0) - Number(form.manufacturer_cost_price || 0);

  const columns = [
    { key: 'code', label: L('Code', 'الكود') },
    { key: 'name', label: L('Name', 'الاسم'), accessor: (r) => r.name_en, render: (r) => <span className="font-medium">{isAr ? r.name_ar || r.name_en : r.name_en}</span> },
    { key: 'category', label: L('Category', 'الفئة'), accessor: (r) => catName(r.category_id), render: (r) => catName(r.category_id) },
    { key: 'color', label: L('Color', 'اللون'), render: (r) => r.color || '—' },
    { key: 'size', label: L('Size', 'المقاس'), render: (r) => r.size || '—' },
    { key: 'dims', label: L('Height × Length', 'الارتفاع × الطول'), render: (r) => (r.height || r.length ? `${r.height ?? '—'} × ${r.length ?? '—'} ${r.dimension_unit}` : '—') },
    { key: 'selling_price', label: L('Selling price', 'سعر البيع'), render: (r) => <span className="font-semibold">{n3(r.selling_price)}</span> },
    ...(isSuperAdmin ? [{ key: 'manufacturer_cost_price', label: L('Manufacturer cost', 'تكلفة المصنّع'), render: (r) => n3(r.manufacturer_cost_price) }] : []),
    { key: 'is_active', label: L('Status', 'الحالة'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{r.is_active ? L('Active', 'نشط') : L('Inactive', 'غير نشط')}</span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={L('Manufacture Items', 'أصناف التصنيع')}
        subtitle={L('Made-to-order products offered on POS Manufacture Orders', 'منتجات تُصنّع عند الطلب وتظهر في طلبات التصنيع بنقطة البيع')}
        actions={isSuperAdmin && (
          <div className="flex gap-2">
            <button onClick={openNewCat} className="btn-ghost"><Layers size={16} />{L('New category', 'فئة جديدة')}</button>
            <button onClick={openNewItem} disabled={!categories.length} className="btn-primary"><Plus size={16} />{L('New item', 'صنف جديد')}</button>
          </div>
        )}
      />

      <div className="grid lg:grid-cols-[240px_1fr] gap-5">
        <aside className="card p-3 h-fit">
          <p className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{L('Categories', 'الفئات')}</p>
          <button onClick={() => setActiveCat('')} className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${!activeCat ? 'bg-indigo-50 text-indigo-700 font-semibold dark:bg-navy-800' : 'hover:bg-slate-50 dark:hover:bg-navy-800'}`}>
            <span>{L('All items', 'كل الأصناف')}</span><span className="text-xs text-slate-400">{items.length}</span>
          </button>
          {categories.map((c) => (
            <div key={c.id} className={`group flex items-center rounded-xl ${activeCat === c.id ? 'bg-indigo-50 dark:bg-navy-800' : 'hover:bg-slate-50 dark:hover:bg-navy-800'}`}>
              <button onClick={() => setActiveCat(c.id)} className={`flex-1 flex items-center justify-between px-3 py-2.5 text-sm text-start ${activeCat === c.id ? 'text-indigo-700 font-semibold' : ''} ${c.is_active ? '' : 'opacity-50'}`}>
                <span className="truncate">{isAr ? c.name_ar || c.name_en : c.name_en}</span>
                <span className="text-xs text-slate-400 ms-2">{items.filter((i) => i.category_id === c.id).length}</span>
              </button>
              {isSuperAdmin && <button onClick={() => openEditCat(c)} className="p-1.5 me-1 rounded-lg text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100"><Pencil size={13} /></button>}
            </div>
          ))}
          {!categories.length && <p className="px-3 py-4 text-xs text-slate-400">{isSuperAdmin ? L('Create a category first.', 'أنشئ فئة أولاً.') : L('No categories yet.', 'لا توجد فئات بعد.')}</p>}
        </aside>

        <DataTable
          columns={columns} data={shown} loading={loading} pageSize={25}
          isInactive={(r) => !r.is_active}
          onEdit={isSuperAdmin ? openEditItem : undefined}
          onToggleActive={isSuperAdmin ? toggleActive : undefined}
        />
      </div>

      <SlideOver open={catOpen} onClose={() => setCatOpen(false)} title={catForm.id ? L('Edit category', 'تعديل الفئة') : L('New category', 'فئة جديدة')} onSubmit={saveCat} submitting={saving}>
        <div><label className="label">{L('Name (English)', 'الاسم (إنجليزي)')}</label><input required className="input" value={catForm.name_en} onChange={(e) => setCatForm({ ...catForm, name_en: e.target.value })} /></div>
        <div><label className="label">{L('Name (Arabic)', 'الاسم (عربي)')}</label><input dir="rtl" className="input" value={catForm.name_ar} onChange={(e) => setCatForm({ ...catForm, name_ar: e.target.value })} /></div>
        {catForm.id && (
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="rounded" checked={catForm.is_active} onChange={(e) => setCatForm({ ...catForm, is_active: e.target.checked })} />{L('Active', 'نشط')}</label>
        )}
      </SlideOver>

      <SlideOver wide open={itemOpen} onClose={() => setItemOpen(false)} title={editing ? `${L('Edit item', 'تعديل صنف')} ${editing.code}` : L('New manufacture item', 'صنف تصنيع جديد')} onSubmit={saveItem} submitting={saving}>
        <div>
          <label className="label">{L('Category', 'الفئة')} *</label>
          <select required className="input" value={form.category_id} onChange={setF('category_id')}>
            <option value="">—</option>{categories.filter((c) => c.is_active || c.id === form.category_id).map((c) => <option key={c.id} value={c.id}>{isAr ? c.name_ar || c.name_en : c.name_en}</option>)}
          </select>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label">{L('Name (English)', 'الاسم (إنجليزي)')} *</label><input required className="input" value={form.name_en} onChange={setF('name_en')} /></div>
          <div><label className="label">{L('Name (Arabic)', 'الاسم (عربي)')}</label><input dir="rtl" className="input" value={form.name_ar} onChange={setF('name_ar')} /></div>
          <div><label className="label">{L('Color', 'اللون')}</label><input className="input" value={form.color} onChange={setF('color')} /></div>
          <div><label className="label">{L('Size', 'المقاس')}</label><input className="input" value={form.size} onChange={setF('size')} /></div>
          <div><label className="label">{L('Height', 'الارتفاع')}</label><input type="number" step="0.001" min="0" className="input" value={form.height} onChange={setF('height')} /></div>
          <div><label className="label">{L('Length', 'الطول')}</label><input type="number" step="0.001" min="0" className="input" value={form.length} onChange={setF('length')} /></div>
          <div><label className="label">{L('Dimension unit', 'وحدة القياس')}</label>
            <select className="input" value={form.dimension_unit} onChange={setF('dimension_unit')}>{['cm', 'm', 'mm', 'in'].map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
          <div><label className="label">{L('Default manufacturer', 'المصنّع الافتراضي')}</label>
            <select className="input" value={form.manufacturer_id} onChange={setF('manufacturer_id')}><option value="">—</option>{manufacturers.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{isAr ? m.name_ar || m.name_en : m.name_en}</option>)}</select></div>
          <div><label className="label">{L('Selling price', 'سعر البيع')} *</label><input required type="number" step="0.001" min="0" className="input" value={form.selling_price} onChange={setF('selling_price')} /></div>
          <div><label className="label">{L('Manufacturer cost price', 'سعر تكلفة المصنّع')} *</label><input required type="number" step="0.001" min="0" className="input" value={form.manufacturer_cost_price} onChange={setF('manufacturer_cost_price')} /></div>
        </div>
        <div className="rounded-2xl bg-slate-50 dark:bg-navy-800/50 px-4 py-3 text-sm flex items-center gap-2">
          <Hammer size={15} className="text-slate-400" />{L('Margin per unit', 'الهامش للوحدة')}: <span className={`font-bold ${margin < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{margin.toFixed(3)}</span>
          <span className="text-xs text-slate-400 ms-2">{L('The POS operator can change the selling price on each order.', 'يمكن لمشغل نقطة البيع تعديل سعر البيع في كل طلب.')}</span>
        </div>
        {editing && <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="rounded" checked={form.is_active} onChange={setF('is_active')} />{L('Active', 'نشط')}</label>}
      </SlideOver>
    </div>
  );
}
