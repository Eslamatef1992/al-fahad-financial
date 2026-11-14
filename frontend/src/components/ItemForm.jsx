import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, Upload, Trash2, Plus, Package, Wrench, Boxes, CheckCircle2, Ruler, Tag, Wallet, ListPlus, FileText, Image as ImageIcon,
} from 'lucide-react';
import { fileUrl } from '@/api/client';

// Full "item card" form (OSOSS-style tabbed modal). Presentational: ItemsPage owns
// the state and API calls and passes everything in through props.
const TYPES = [
  { v: 'stock', icon: Package, en: 'Stock item', ar: 'مخزني' },
  { v: 'service', icon: Wrench, en: 'Service', ar: 'خدمي' },
  { v: 'assembled', icon: Boxes, en: 'Assembled / bundle', ar: 'مجمع' },
  { v: 'finished', icon: CheckCircle2, en: 'Finished product', ar: 'منتج نهائي' },
];

const TABS = [
  { k: 'basic', icon: FileText, en: 'Basic data', ar: 'البيانات الأساسية' },
  { k: 'details', icon: Tag, en: 'Details', ar: 'التفاصيل' },
  { k: 'units', icon: Ruler, en: 'Units', ar: 'الوحدات' },
  { k: 'prices', icon: Wallet, en: 'Prices & accounts', ar: 'الأسعار' },
  { k: 'balance', icon: Boxes, en: 'Balance', ar: 'الرصيد' },
  { k: 'extra', icon: ListPlus, en: 'Extra data', ar: 'بيانات إضافية' },
];

// Module-level on purpose: defining this inside the form component would remount
// every input on each keystroke and drop focus.
function Field({ label, children, className = '' }) {
  return <div className={className}><label className="label">{label}</label>{children}</div>;
}

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—');

export default function ItemForm({
  open, onClose, editing, form, setForm, onSubmit, saving,
  units, categories, suppliers, manufacturers, items,
  assetAccounts, expenseAccounts,
  selectUnit, newUnitName, setNewUnitName, addUnit, addingUnit,
  newCategoryName, setNewCategoryName, addCategory, addingCategory,
  attrInput, setAttrInput, addAttrName, removeAttrName,
  uploadImage, removeImage, uploadingImage,
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const [tab, setTab] = useState('basic');
  useEffect(() => { if (open) setTab('basic'); }, [open, editing?.id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const catName = (c) => (isAr ? c.name_ar || c.name_en : c.name_en);
  const otherItems = items.filter((i) => !editing || i.id !== editing.id);
  const extra = form.extra_data || [];
  const setExtra = (rows) => setForm({ ...form, extra_data: rows });

  const catSelect = (key, label) => (
    <Field label={label}>
      <select className="input" value={form[key] || ''} onChange={set(key)}>
        <option value="">{t('common.none')}</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{catName(c)}</option>)}
      </select>
    </Field>
  );

  const onTypeNumberWheel = (e) => e.currentTarget.blur();

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <motion.div
            key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm"
          />
          <motion.form
            key="panel" onSubmit={(e) => onSubmit(e, false)}
            initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
            className="relative w-full max-w-5xl max-h-[94vh] flex flex-col rounded-3xl bg-white dark:bg-navy-900 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-navy-800">
              <div>
                <h2 className="font-bold text-lg text-navy-900 dark:text-white">
                  {editing ? L('Edit item', 'تعديل صنف') : L('Add new item', 'إضافة صنف جديد')}
                </h2>
                {editing && <p className="text-xs text-slate-400 mt-0.5">{editing.code} · {editing.name_en}</p>}
              </div>
              <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-navy-800"><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-4 pt-3 border-b border-slate-100 dark:border-navy-800 overflow-x-auto">
              {TABS.map((tb) => (
                <button
                  key={tb.k} type="button" onClick={() => setTab(tb.k)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl whitespace-nowrap border-b-2 transition-colors ${
                    tab === tb.k ? 'border-indigo-500 text-indigo-600 bg-indigo-50/60 dark:bg-navy-800' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-navy-800'
                  }`}
                >
                  <tb.icon size={15} />{isAr ? tb.ar : tb.en}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {tab === 'basic' && (
                <div className="grid lg:grid-cols-[1fr_240px] gap-6">
                  <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field label={t('common.code')}>
                        <input disabled className="input opacity-60" value={editing ? editing.code : L('Auto-generated on save', 'يُنشأ تلقائياً عند الحفظ')} />
                      </Field>
                      <Field label={L('Barcode', 'الباركود')}>
                        <input className="input" value={form.barcode || ''} onChange={set('barcode')} placeholder={L('Scan or type barcode', 'امسح أو اكتب الباركود')} />
                      </Field>
                    </div>
                    <Field label={`${t('common.nameAr')} *`}>
                      <input required dir="rtl" className="input" value={form.name_ar} onChange={set('name_ar')} />
                    </Field>
                    <Field label={`${t('common.nameEn')} *`}>
                      <input required className="input" value={form.name_en} onChange={set('name_en')} />
                    </Field>

                    <div>
                      <label className="label">{L('Item type', 'نوع الصنف')}</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {TYPES.map((ty) => (
                          <button
                            key={ty.v} type="button" onClick={() => setForm({ ...form, item_type: ty.v })}
                            className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-3 py-3 text-sm font-semibold transition-all ${
                              form.item_type === ty.v
                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-navy-800 dark:text-white'
                                : 'border-slate-100 dark:border-navy-800 text-slate-500 hover:border-slate-200'
                            }`}
                          >
                            <ty.icon size={20} />{isAr ? ty.ar : ty.en}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" className="rounded" checked={!!form.is_rental} onChange={set('is_rental')} />
                        {L('Rental item', 'صنف إيجار')}
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" className="rounded" checked={!!form.is_quick_search} onChange={set('is_quick_search')} />
                        {L('Quick-search item', 'أصناف سريعة في البحث')}
                      </label>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      {catSelect('category_id', L('Category 1', 'الفئة الأولى'))}
                      {catSelect('category2_id', L('Category 2', 'الفئة الثانية'))}
                      {catSelect('category3_id', L('Category 3', 'الفئة الثالثة'))}
                      {catSelect('category4_id', L('Category 4', 'الفئة الرابعة'))}
                    </div>
                    <Field label={t('items.addCategory')}>
                      <div className="flex gap-2">
                        <input
                          className="input" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                          placeholder={t('items.newCategoryPlaceholder')}
                        />
                        <button type="button" onClick={addCategory} disabled={addingCategory || !newCategoryName.trim()} className="btn-ghost shrink-0"><Plus size={15} />{t('common.add')}</button>
                      </div>
                    </Field>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field label={L('Manufacturer', 'الشركة المصنعة')}>
                        <select className="input" value={form.manufacturer_id || ''} onChange={set('manufacturer_id')}>
                          <option value="">{t('common.none')}</option>
                          {manufacturers.map((m) => <option key={m.id} value={m.id}>{catName(m)}</option>)}
                        </select>
                      </Field>
                      <Field label={L('Supplier', 'المورد')}>
                        <select className="input" value={form.supplier_id || ''} onChange={set('supplier_id')}>
                          <option value="">{t('common.none')}</option>
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{catName(s)}</option>)}
                        </select>
                      </Field>
                    </div>

                    <Field label={t('common.notes')}>
                      <textarea rows={3} className="input" value={form.notes || ''} onChange={set('notes')} />
                    </Field>
                  </div>

                  {/* Image panel */}
                  <div>
                    <label className="label">{t('items.image')}</label>
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-800/40 aspect-square flex items-center justify-center overflow-hidden">
                      {editing?.image_url
                        ? <img src={fileUrl(editing.image_url)} alt="" className="w-full h-full object-contain" />
                        : <ImageIcon size={44} className="text-slate-300" />}
                    </div>
                    {editing ? (
                      <div className="flex gap-2 mt-2">
                        <label className="btn-ghost cursor-pointer !py-1.5 flex-1">
                          <Upload size={14} /> {uploadingImage ? t('common.loading') : (editing.image_url ? t('items.replaceImage') : t('items.uploadImage'))}
                          <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" disabled={uploadingImage} onChange={uploadImage} />
                        </label>
                        {editing.image_url && (
                          <button type="button" onClick={removeImage} disabled={uploadingImage} className="p-2 rounded-xl hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 mt-2">{t('items.imageHint')}</p>
                    )}
                  </div>
                </div>
              )}

              {tab === 'details' && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label={L('Type', 'النوع')}><input className="input" value={form.item_class || ''} onChange={set('item_class')} /></Field>
                  <Field label={L('Country of origin', 'البلد')}><input className="input" value={form.origin_country || ''} onChange={set('origin_country')} /></Field>
                  <Field label={L('Brand', 'الماركة')}><input className="input" value={form.brand || ''} onChange={set('brand')} /></Field>
                  <Field label={L('Color', 'اللون')}><input className="input" value={form.color || ''} onChange={set('color')} /></Field>
                  <Field label={L('Size', 'المقاس')}><input className="input" value={form.size || ''} onChange={set('size')} /></Field>
                  <Field label={L('Weight', 'الوزن')}><input type="number" step="0.001" onWheel={onTypeNumberWheel} className="input" value={form.weight ?? ''} onChange={set('weight')} /></Field>
                  <Field label={L('Model', 'الموديل')}><input className="input" value={form.model || ''} onChange={set('model')} /></Field>
                  <Field label={L('Model part', 'جزء الموديل')}><input className="input" value={form.model_part || ''} onChange={set('model_part')} /></Field>
                  <Field label={L('Part number', 'رقم القطعة')}><input className="input" value={form.part_number || ''} onChange={set('part_number')} /></Field>
                  <Field label={L('Season', 'الموسم')}><input className="input" value={form.season || ''} onChange={set('season')} /></Field>
                  <Field label={t('items.sku')}><input className="input" value={form.sku || ''} onChange={set('sku')} placeholder={t('items.skuPlaceholder')} /></Field>
                  <Field label={L('Sort order', 'ترتيب')}><input type="number" onWheel={onTypeNumberWheel} className="input" value={form.sort_order ?? 0} onChange={set('sort_order')} /></Field>
                  <Field label={L('Original item', 'رقم الصنف الأصلي')}>
                    <select className="input" value={form.original_item_id || ''} onChange={set('original_item_id')}>
                      <option value="">{t('common.none')}</option>
                      {otherItems.map((i) => <option key={i.id} value={i.id}>{i.code} - {i.name_en}</option>)}
                    </select>
                  </Field>
                  <Field label={L('Alternative item', 'رقم البديل')}>
                    <select className="input" value={form.alternative_item_id || ''} onChange={set('alternative_item_id')}>
                      <option value="">{t('common.none')}</option>
                      {otherItems.map((i) => <option key={i.id} value={i.id}>{i.code} - {i.name_en}</option>)}
                    </select>
                  </Field>
                  <Field label={L('Dead-stock months', 'عدد أشهر الركود')}>
                    <input type="number" min="0" onWheel={onTypeNumberWheel} className="input" value={form.dead_stock_months ?? 0} onChange={set('dead_stock_months')} />
                  </Field>
                </div>
              )}

              {tab === 'units' && (
                <div className="max-w-xl space-y-5">
                  <Field label={t('items.unit')}>
                    <select className="input" value={form.unit_id} onChange={(e) => selectUnit(e.target.value)}>
                      <option value="">{t('common.select')}</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name_en}{u.base_unit_id ? ` (1 = ${Number(u.conversion_factor)} ${u.baseUnit?.name_en || ''})` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('items.addUnit')}>
                    <div className="flex gap-2">
                      <input
                        className="input" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUnit(); } }}
                        placeholder={t('items.newUnitPlaceholder')}
                      />
                      <button type="button" onClick={addUnit} disabled={addingUnit || !newUnitName.trim()} className="btn-ghost shrink-0"><Plus size={15} />{t('common.add')}</button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{t('items.addUnitHint')}</p>
                  </Field>
                  <Field label={t('items.variantAttributes')}>
                    <div className="flex gap-2">
                      <input
                        className="input" value={attrInput} onChange={(e) => setAttrInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttrName(); } }}
                        placeholder={t('items.variantAttributesPlaceholder')}
                      />
                      <button type="button" onClick={addAttrName} className="btn-ghost shrink-0"><Plus size={15} />{t('common.add')}</button>
                    </div>
                    {form.variant_attributes.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {form.variant_attributes.map((a) => (
                          <span key={a} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-950 text-violet-600 text-xs font-medium">
                            {a}<button type="button" onClick={() => removeAttrName(a)}><X size={12} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{t('items.variantAttributesHint')}</p>
                  </Field>
                </div>
              )}

              {tab === 'prices' && (
                <div className="space-y-5">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Field label={t('items.sellingPrice')}><input type="number" step="0.001" onWheel={onTypeNumberWheel} className="input" value={form.selling_price} onChange={set('selling_price')} /></Field>
                    <Field label={L('Wholesale price', 'سعر الجملة')}><input type="number" step="0.001" onWheel={onTypeNumberWheel} className="input" value={form.wholesale_price ?? 0} onChange={set('wholesale_price')} /></Field>
                    <Field label={L('Minimum price', 'أقل سعر بيع')}><input type="number" step="0.001" onWheel={onTypeNumberWheel} className="input" value={form.min_price ?? 0} onChange={set('min_price')} /></Field>
                    <Field label={t('items.reorderLevel')}><input type="number" step="0.001" onWheel={onTypeNumberWheel} className="input" value={form.reorder_level} onChange={set('reorder_level')} /></Field>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label={t('items.inventoryAccount')}>
                      <select required className="input" value={form.inventory_account_id} onChange={set('inventory_account_id')}>
                        <option value="">{t('common.select')}</option>
                        {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
                      </select>
                      <p className="text-xs text-slate-400 mt-1">{t('items.inventoryAccountHint')}</p>
                    </Field>
                    <Field label={t('items.cogsAccount')}>
                      <select required className="input" value={form.cogs_account_id} onChange={set('cogs_account_id')}>
                        <option value="">{t('common.select')}</option>
                        {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {tab === 'balance' && (
                editing ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      [L('Stock on hand', 'الرصيد الحالي'), Number(editing.total_quantity_on_hand ?? editing.quantity_on_hand ?? 0).toFixed(2)],
                      [L('Booked', 'المحجوز'), Number(editing.booked_quantity ?? 0).toFixed(2)],
                      [L('Available', 'المتاح'), Number(editing.available_quantity ?? editing.total_quantity_on_hand ?? 0).toFixed(2)],
                      [L('Average cost', 'متوسط التكلفة'), Number(editing.cost_price ?? 0).toFixed(3)],
                    ].map(([label, val]) => (
                      <div key={label} className="rounded-2xl bg-indigo-50 dark:bg-navy-800 p-4">
                        <p className="text-xs font-semibold text-slate-500">{label}</p>
                        <p className="text-2xl font-extrabold text-indigo-600 mt-1">{val}</p>
                      </div>
                    ))}
                    <p className="sm:col-span-2 lg:col-span-4 text-xs text-slate-400">
                      {L('Stock changes only through purchases, sales, transfers and stock adjustments (use the adjust icon on the item row).', 'يتغير الرصيد فقط من خلال المشتريات والمبيعات والتحويلات وتسويات المخزون (استخدم أيقونة التسوية في صف الصنف).')}
                    </p>
                  </div>
                ) : form.variant_attributes.length > 0 ? (
                  <p className="text-sm text-slate-500">{t('items.variantsOpeningHint')}</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
                    <Field label={t('items.openingQuantity')}><input type="number" step="0.001" onWheel={onTypeNumberWheel} className="input" value={form.opening_quantity} onChange={set('opening_quantity')} /></Field>
                    <Field label={t('items.openingCost')}><input type="number" step="0.001" onWheel={onTypeNumberWheel} className="input" value={form.opening_cost} onChange={set('opening_cost')} /></Field>
                  </div>
                )
              )}

              {tab === 'extra' && (
                <div className="max-w-2xl space-y-2">
                  <p className="text-xs text-slate-400 mb-2">{L('Add any custom fields for this item (name / value).', 'أضف أي بيانات إضافية لهذا الصنف (الاسم / القيمة).')}</p>
                  {extra.map((row, i) => (
                    <div key={i} className="flex gap-2">
                      <input className="input" placeholder={L('Field name', 'اسم الحقل')} value={row.key} onChange={(e) => setExtra(extra.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))} />
                      <input className="input" placeholder={L('Value', 'القيمة')} value={row.value} onChange={(e) => setExtra(extra.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} />
                      <button type="button" onClick={() => setExtra(extra.filter((_, j) => j !== i))} className="p-2 rounded-xl hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setExtra([...extra, { key: '', value: '' }])} className="btn-ghost"><Plus size={15} />{L('Add field', 'إضافة حقل')}</button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-navy-800 bg-slate-50/60 dark:bg-navy-900">
              <div className="text-xs text-slate-400 space-y-0.5">
                {editing && (
                  <>
                    <p>{L('Created by', 'القائم بالإدخال')}: <span className="font-medium text-slate-500">{editing.created_by_name || '—'}</span> · {fmtDate(editing.createdAt)}</p>
                    <p>{L('Last edited by', 'القائم بالتعديل')}: <span className="font-medium text-slate-500">{editing.updated_by_name || '—'}</span> · {fmtDate(editing.updatedAt)}</p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
                {!editing && (
                  <button type="button" disabled={saving} onClick={(e) => { if (e.currentTarget.form?.reportValidity()) onSubmit(e, true); }} className="btn-ghost !bg-white border border-slate-200">
                    {L('Save & new', 'حفظ وجديد')}
                  </button>
                )}
                <button type="submit" disabled={saving} className="btn-primary">{saving ? t('common.loading') : t('common.save')}</button>
              </div>
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>
  );
}
