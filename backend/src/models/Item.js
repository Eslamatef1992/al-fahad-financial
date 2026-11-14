// Inventory item / product master. Stock quantity and cost_price are
// system-maintained (weighted-average costing, single warehouse) — they only
// change via itemService.receiveStock/issueStock/adjustStock, never via a
// direct field edit, so every movement stays traceable through
// InventoryTransaction.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Item', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    code: { type: DataTypes.STRING(30), allowNull: false },
    // Optional user-entered identifier (barcode, supplier SKU, etc.) — separate
    // from the auto-generated `code` above. For items with variants, each
    // ItemVariant carries its own sku instead and this field is typically left
    // blank on the parent.
    sku: { type: DataTypes.STRING(60), allowNull: true },
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: false },
    category: { type: DataTypes.STRING(100) }, // legacy free-text category, kept for old records
    category_id: { type: DataTypes.UUID, allowNull: true }, // preferred going forward — links to a managed ItemCategory
    unit: { type: DataTypes.STRING(30), defaultValue: 'pcs' }, // legacy free-text unit, kept for old records
    unit_id: { type: DataTypes.UUID, allowNull: true }, // preferred going forward — links to a managed Unit with conversion info
    image_url: { type: DataTypes.STRING(255), allowNull: true }, // optional product photo, stored as an uploaded file (see uploadImage)
    // Names of the attributes that define this item's variants, e.g.
    // ["Color", "Size"] — purely drives the "add variant" UI so every variant
    // of the same item is prompted for the same attribute set. Empty/absent
    // means this item has no variants and is tracked exactly as before
    // (quantity_on_hand/cost_price directly on the Item row).
    variant_attributes: { type: DataTypes.JSON, defaultValue: [] },
    // Chart-of-Accounts links — where this item's value/movements post to.
    inventory_account_id: { type: DataTypes.UUID, allowNull: false }, // asset: stock value
    income_account_id: { type: DataTypes.UUID, allowNull: false },    // revenue: default sales line account
    cogs_account_id: { type: DataTypes.UUID, allowNull: false },      // expense: cost of goods sold
    selling_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    cost_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },       // running weighted-average cost
    quantity_on_hand: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 }, // running stock balance
    reorder_level: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },

    // ---- Extended item card (matches the classic ERP "Items" screen) ----
    // All nullable / defaulted so existing rows and API callers are unaffected.
    barcode: { type: DataTypes.STRING(60), allowNull: true },
    // stock (مخزني) | service (خدمي) | assembled (مجمع) | finished (منتج نهائي)
    item_type: { type: DataTypes.STRING(20), defaultValue: 'stock' },
    is_rental: { type: DataTypes.BOOLEAN, defaultValue: false },       // صنف إيجار
    is_quick_search: { type: DataTypes.BOOLEAN, defaultValue: false }, // أصناف سريعة في البحث
    dead_stock_months: { type: DataTypes.INTEGER, defaultValue: 0 },   // عدد أشهر الركود
    item_class: { type: DataTypes.STRING(60), allowNull: true },       // النوع
    origin_country: { type: DataTypes.STRING(60), allowNull: true },   // البلد
    color: { type: DataTypes.STRING(60), allowNull: true },            // اللون
    brand: { type: DataTypes.STRING(60), allowNull: true },            // الماركة
    size: { type: DataTypes.STRING(60), allowNull: true },             // المقاس
    weight: { type: DataTypes.DECIMAL(18, 3), allowNull: true },       // الوزن
    model: { type: DataTypes.STRING(60), allowNull: true },            // الموديل
    model_part: { type: DataTypes.STRING(60), allowNull: true },       // جزء الموديل
    part_number: { type: DataTypes.STRING(60), allowNull: true },      // رقم القطعة
    season: { type: DataTypes.STRING(60), allowNull: true },           // الموسم
    category2_id: { type: DataTypes.UUID, allowNull: true },           // الفئة الثانية
    category3_id: { type: DataTypes.UUID, allowNull: true },           // الفئة الثالثة
    category4_id: { type: DataTypes.UUID, allowNull: true },           // الفئة الرابعة
    manufacturer_id: { type: DataTypes.UUID, allowNull: true },        // الشركة المصنعة
    supplier_id: { type: DataTypes.UUID, allowNull: true },            // المورد
    original_item_id: { type: DataTypes.UUID, allowNull: true },       // رقم الصنف الأصلي
    alternative_item_id: { type: DataTypes.UUID, allowNull: true },    // رقم البديل
    wholesale_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    min_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    notes: { type: DataTypes.TEXT, allowNull: true },                  // ملاحظات
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },          // ترتيب
    extra_data: { type: DataTypes.JSON, defaultValue: [] },            // بيانات إضافية: [{key, value}]
    created_by_name: { type: DataTypes.STRING(120), allowNull: true }, // القائم بالادخال
    updated_by_name: { type: DataTypes.STRING(120), allowNull: true }, // القائم بالتعديل
  }, {
    tableName: 'items',
    indexes: [
      { unique: true, fields: ['company_id', 'code'] },
      { unique: true, fields: ['company_id', 'sku'] },
    ],
  });
};
