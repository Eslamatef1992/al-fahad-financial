// One-off seed script: creates a starter food & beverage item catalog + a
// sample retail client + a handful of posted sales invoices for the
// "Mr Mohsen" company. Run from the backend/ directory on the VPS (it uses
// the same src/models -> src/config/db -> .env chain as the real app, so it
// writes straight into the production database).
//
// Usage:
//   cd /var/www/al-fahad-financial/backend
//   node seed_mohsen.js
//
// Safe to re-run: it looks up existing accounts/categories/items/client by
// name before creating anything, so a second run won't create duplicates —
// it will just report what's already there and add any posted invoices are
// skipped only via the item/client checks (invoices are only created on a
// completely fresh run where no items exist yet, to avoid double-booking
// stock/ledger entries).

const path = require('path');
const { Op } = require('sequelize');

async function main() {
  const {
    sequelize, Company, Account, Client, ItemCategory, Item,
  } = require(path.join(process.cwd(), 'src/models'));
  const itemService = require(path.join(process.cwd(), 'src/services/itemService'));
  const invoiceService = require(path.join(process.cwd(), 'src/services/invoiceService'));
  const { nextCode } = require(path.join(process.cwd(), 'src/utils/codeGenerator'));
  const { createLinkedAccount } = require(path.join(process.cwd(), 'src/utils/linkedAccount'));

  // ---- 1. Find the company ----
  const matches = await Company.findAll({
    where: {
      [Op.or]: [
        { name_en: { [Op.iLike]: '%mohsen%' } },
        { name_ar: { [Op.iLike]: '%محسن%' } },
      ],
    },
  });

  if (matches.length === 0) {
    console.log('No company matching "Mohsen" was found. Existing companies:');
    const all = await Company.findAll({ attributes: ['id', 'name_en', 'name_ar', 'code'] });
    all.forEach((c) => console.log(`  - ${c.name_en} / ${c.name_ar} (code: ${c.code}, id: ${c.id})`));
    console.log('\nRe-run with the exact company name adjusted in this script if needed.');
    process.exit(1);
  }
  if (matches.length > 1) {
    console.log('Multiple companies match "Mohsen" — narrow it down:');
    matches.forEach((c) => console.log(`  - ${c.name_en} / ${c.name_ar} (id: ${c.id})`));
    process.exit(1);
  }
  const company = matches[0];
  const companyId = company.id;
  console.log(`Using company: ${company.name_en} (${company.id})`);

  // ---- 2. Find or create the Chart of Accounts entries we need ----
  async function findOrCreateAccount({ type, normalBalance, nameContains, name_en, name_ar, codePrefix }) {
    let acc = await Account.findOne({
      where: { company_id: companyId, type, is_group: false, name_en: { [Op.iLike]: `%${nameContains}%` } },
    });
    if (acc) {
      console.log(`  Reusing existing ${type} account: ${acc.code} - ${acc.name_en}`);
      return acc;
    }
    const code = await nextCode(Account, companyId, codePrefix);
    acc = await Account.create({
      company_id: companyId, code, name_en, name_ar, type,
      normal_balance: normalBalance, is_group: false, level: 1, parent_id: null,
    });
    console.log(`  Created ${type} account: ${acc.code} - ${acc.name_en}`);
    return acc;
  }

  console.log('Resolving accounts...');
  const inventoryAcc = await findOrCreateAccount({
    type: 'asset', normalBalance: 'debit', nameContains: 'inventory',
    name_en: 'Food & Beverage Inventory', name_ar: 'مخزون المواد الغذائية والمشروبات', codePrefix: 'INV',
  });
  const revenueAcc = await findOrCreateAccount({
    type: 'revenue', normalBalance: 'credit', nameContains: 'sales',
    name_en: 'Food & Beverage Sales', name_ar: 'مبيعات المواد الغذائية والمشروبات', codePrefix: 'REV',
  });
  const cogsAcc = await findOrCreateAccount({
    type: 'expense', normalBalance: 'debit', nameContains: 'cost of goods',
    name_en: 'Cost of Goods Sold - F&B', name_ar: 'تكلفة البضاعة المباعة', codePrefix: 'COGS',
  });

  // AR is looked up separately (no is_group filter) because the company's
  // "Accounts Receivable" account is very likely already a group/control
  // account with existing client sub-accounts under it — findOrCreateAccount
  // would miss it and create a duplicate.
  let arAcc = await Account.findOne({
    where: { company_id: companyId, type: 'asset', name_en: { [Op.iLike]: '%receivable%' } },
  });
  if (arAcc) {
    console.log(`  Reusing existing asset account: ${arAcc.code} - ${arAcc.name_en}`);
  } else {
    const code = await nextCode(Account, companyId, 'AR');
    arAcc = await Account.create({
      company_id: companyId, code, name_en: 'Accounts Receivable', name_ar: 'ذمم مدينة',
      type: 'asset', normal_balance: 'debit', is_group: false, level: 1, parent_id: null,
    });
    console.log(`  Created asset account: ${arAcc.code} - ${arAcc.name_en}`);
  }

  // ---- 3. Item categories ----
  async function findOrCreateCategory(name_en, name_ar) {
    let cat = await ItemCategory.findOne({ where: { company_id: companyId, name_en } });
    if (cat) return cat;
    cat = await ItemCategory.create({ company_id: companyId, name_en, name_ar });
    console.log(`  Created category: ${cat.name_en}`);
    return cat;
  }
  console.log('Resolving item categories...');
  const catBeverages = await findOrCreateCategory('Beverages', 'المشروبات');
  const catSnacks = await findOrCreateCategory('Snacks & Food', 'الوجبات الخفيفة والأغذية');

  // ---- 4. Items ----
  const ITEM_DEFS = [
    { name_en: 'Bottled Water 500ml', name_ar: 'مياه معدنية 500 مل', sku: 'FB-WATER-500', unit: 'bottle', category: catBeverages, cost: 0.100, price: 0.250, qty: 500, reorder: 50 },
    { name_en: 'Orange Juice 1L', name_ar: 'عصير برتقال 1 لتر', sku: 'FB-JUICE-OJ-1L', unit: 'bottle', category: catBeverages, cost: 0.400, price: 0.750, qty: 200, reorder: 20 },
    { name_en: 'Cola Can 330ml', name_ar: 'كولا علبة 330 مل', sku: 'FB-COLA-330', unit: 'can', category: catBeverages, cost: 0.150, price: 0.300, qty: 400, reorder: 40 },
    { name_en: 'Arabic Coffee 250g', name_ar: 'قهوة عربية 250 جرام', sku: 'FB-COFFEE-AR-250', unit: 'box', category: catBeverages, cost: 1.200, price: 2.000, qty: 100, reorder: 10 },
    { name_en: 'Energy Drink 250ml', name_ar: 'مشروب طاقة 250 مل', sku: 'FB-ENERGY-250', unit: 'can', category: catBeverages, cost: 0.300, price: 0.600, qty: 250, reorder: 25 },
    { name_en: 'Potato Chips 150g', name_ar: 'رقائق بطاطس 150 جرام', sku: 'FB-CHIPS-150', unit: 'pack', category: catSnacks, cost: 0.200, price: 0.400, qty: 300, reorder: 30 },
    { name_en: 'Chocolate Bar 50g', name_ar: 'شوكولاتة 50 جرام', sku: 'FB-CHOC-50', unit: 'pcs', category: catSnacks, cost: 0.150, price: 0.350, qty: 300, reorder: 30 },
    { name_en: 'Mixed Nuts 500g', name_ar: 'مكسرات مشكلة 500 جرام', sku: 'FB-NUTS-500', unit: 'pack', category: catSnacks, cost: 1.500, price: 2.500, qty: 100, reorder: 10 },
  ];

  console.log('Resolving items...');
  const items = {};
  let createdAnyNewItem = false;
  for (const def of ITEM_DEFS) {
    let item = await Item.findOne({ where: { company_id: companyId, name_en: def.name_en } });
    if (item) {
      console.log(`  Reusing existing item: ${item.code} - ${item.name_en}`);
    } else {
      item = await itemService.createItem(companyId, null, {
        name_en: def.name_en, name_ar: def.name_ar, sku: def.sku, unit: def.unit,
        category_id: def.category.id,
        inventory_account_id: inventoryAcc.id, income_account_id: revenueAcc.id, cogs_account_id: cogsAcc.id,
        selling_price: def.price, reorder_level: def.reorder,
        opening_quantity: def.qty, opening_cost: def.cost,
      });
      console.log(`  Created item: ${item.code} - ${item.name_en} (opening ${def.qty} @ ${def.cost})`);
      createdAnyNewItem = true;
    }
    items[def.name_en] = { item, price: def.price };
  }

  // ---- 5. Client ----
  let client = await Client.findOne({ where: { company_id: companyId, name_en: { [Op.iLike]: '%grocery%' } } });
  if (client) {
    console.log(`Reusing existing client: ${client.code} - ${client.name_en}`);
  } else {
    const clientCode = await nextCode(Client, companyId, 'CLI');
    const clientAccount = await createLinkedAccount({
      companyId, parentAccountId: arAcc.id, code: clientCode,
      name_en: 'Al Noor Grocery Store', name_ar: 'بقالة النور',
    });
    client = await Client.create({
      company_id: companyId, code: clientCode, account_id: clientAccount.id,
      name_en: 'Al Noor Grocery Store', name_ar: 'بقالة النور',
    });
    console.log(`Created client: ${client.code} - ${client.name_en} (AR sub-account ${clientAccount.code})`);
  }

  // ---- 6. Sales invoices (only on a fresh run, so re-running the script never double-books stock) ----
  if (!createdAnyNewItem) {
    console.log('\nAll items already existed — skipping invoice creation to avoid double-booking stock on a re-run.');
  } else {
    const today = new Date();
    const dateStr = (daysAgo) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };

    function lineFor(name_en, quantity) {
      const { item, price } = items[name_en];
      return { account_id: revenueAcc.id, item_id: item.id, description: item.name_en, quantity, unit_price: price };
    }

    const INVOICE_DEFS = [
      { daysAgo: 3, lines: [lineFor('Bottled Water 500ml', 25), lineFor('Cola Can 330ml', 30), lineFor('Orange Juice 1L', 10)] },
      { daysAgo: 2, lines: [lineFor('Chocolate Bar 50g', 25), lineFor('Mixed Nuts 500g', 8), lineFor('Arabic Coffee 250g', 5)] },
      { daysAgo: 1, lines: [lineFor('Orange Juice 1L', 15), lineFor('Energy Drink 250ml', 20)] },
      { daysAgo: 0, lines: [lineFor('Bottled Water 500ml', 30), lineFor('Cola Can 330ml', 40), lineFor('Potato Chips 150g', 15)] },
    ];

    console.log('\nCreating and posting sales invoices...');
    const postedInvoices = [];
    for (const def of INVOICE_DEFS) {
      const draft = await invoiceService.createInvoice(companyId, null, {
        type: 'sales', client_id: client.id, date: dateStr(def.daysAgo), currency: company.base_currency || 'KWD',
        lines: def.lines,
      });
      const posted = await invoiceService.postInvoice(companyId, draft.id, null);
      postedInvoices.push(posted);
      console.log(`  Posted ${posted.invoice_no} dated ${posted.date} — total ${Number(posted.total).toFixed(3)} ${posted.currency}`);
    }

    console.log('\n---- Summary ----');
    console.log(`Company: ${company.name_en}`);
    console.log(`Client: ${client.name_en} (${client.code})`);
    console.log(`Items created: ${ITEM_DEFS.length}`);
    console.log(`Invoices posted: ${postedInvoices.length}, total value: ${postedInvoices.reduce((s, i) => s + Number(i.total), 0).toFixed(3)} ${company.base_currency || 'KWD'}`);
  }

  await sequelize.close();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
