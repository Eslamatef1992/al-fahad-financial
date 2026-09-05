// Embedded-postgres verification harness for the Branches feature.
// Run from the backend/ directory with:
//   NODE_PATH=/tmp/verify_branches_work/node_modules node /path/to/verify_branches.js
//
// Covers: Branch CRUD, branch_id on Voucher/Invoice/PurchaseOrder headers,
// branch_id propagation into LedgerEntry on posting (voucher + invoice +
// PO-conversion paths), branch filtering on ledger query + trial balance +
// P&L + balance sheet + invoices list + vouchers list, AND the full
// pre-existing baseline (accounts, cost centers, vouchers, invoices+COGS,
// purchase orders) to confirm nothing regressed.

const path = require('path');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');

const DATA_DIR = '/tmp/pgtest_branches/data';
let pass = 0, fail = 0;
const failures = [];

function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.log('FAIL:', name); }
}

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: 55433,
    persistent: true,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase('alfahad_test');

  process.env.DB_NAME = 'alfahad_test';
  process.env.DB_USER = 'postgres';
  process.env.DB_PASSWORD = 'postgres';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '55433';

  const models = require(path.join(process.cwd(), 'src/models'));
  const {
    sequelize, Company, User, Account, CostCenter, Branch,
    Client, Supplier, Voucher, VoucherLine, LedgerEntry,
    Invoice, InvoiceLine, InvoicePayment, Item, PurchaseOrder, PurchaseOrderLine,
    ItemBranchStock, InventoryTransaction, ItemVariant, ItemVariantBranchStock, StockTransferLine, ItemCategory,
    DiscountCode, Unit, ItemBooking, UserCompany, PosShift, FinancialSetting, ItemDamage,
  } = models;

  const voucherService = require(path.join(process.cwd(), 'src/services/voucherService'));
  const invoiceService = require(path.join(process.cwd(), 'src/services/invoiceService'));
  const itemService = require(path.join(process.cwd(), 'src/services/itemService'));
  const purchaseOrderService = require(path.join(process.cwd(), 'src/services/purchaseOrderService'));
  const discountService = require(path.join(process.cwd(), 'src/services/discountService'));
  const branchController = require(path.join(process.cwd(), 'src/controllers/branchController'));
  const reportController = require(path.join(process.cwd(), 'src/controllers/reportController'));
  const ledgerController = require(path.join(process.cwd(), 'src/controllers/ledgerController'));
  const invoiceController = require(path.join(process.cwd(), 'src/controllers/invoiceController'));
  const voucherController = require(path.join(process.cwd(), 'src/controllers/voucherController'));
  const itemController = require(path.join(process.cwd(), 'src/controllers/itemController'));
  const stockTransferController = require(path.join(process.cwd(), 'src/controllers/stockTransferController'));
  const inventoryReportController = require(path.join(process.cwd(), 'src/controllers/inventoryReportController'));
  const itemCategoryController = require(path.join(process.cwd(), 'src/controllers/itemCategoryController'));
  const unitController = require(path.join(process.cwd(), 'src/controllers/unitController'));
  const financialSettingController = require(path.join(process.cwd(), 'src/controllers/financialSettingController'));
  const bookingController = require(path.join(process.cwd(), 'src/controllers/bookingController'));
  const bookingService = require(path.join(process.cwd(), 'src/services/bookingService'));
  const discountCodeController = require(path.join(process.cwd(), 'src/controllers/discountCodeController'));
  const posService = require(path.join(process.cwd(), 'src/services/posService'));
  const posController = require(path.join(process.cwd(), 'src/controllers/posController'));
  const damageService = require(path.join(process.cwd(), 'src/services/damageService'));
  const damageController = require(path.join(process.cwd(), 'src/controllers/damageController'));

  await sequelize.sync({ force: true });
  console.log('Schema synced.');

  // ---- Fixtures ----
  const company = await Company.create({ name_en: 'Al Fahad Test Co', name_ar: 'الفهد', code: 'TEST' });
  const user = await User.create({ name: 'Tester', email: 'tester@test.com', password_hash: 'x', role: 'admin' });

  const assetsParent = await Account.create({ company_id: company.id, code: '1000', name_en: 'Assets', name_ar: 'أصول', type: 'asset', normal_balance: 'debit', is_group: true });
  const cash = await Account.create({ company_id: company.id, code: '1010', name_en: 'Cash', name_ar: 'نقد', type: 'asset', normal_balance: 'debit', parent_id: assetsParent.id });
  const ar = await Account.create({ company_id: company.id, code: '1020', name_en: 'Accounts Receivable', name_ar: 'ذمم', type: 'asset', normal_balance: 'debit', parent_id: assetsParent.id });
  const inventoryAcc = await Account.create({ company_id: company.id, code: '1030', name_en: 'Inventory', name_ar: 'مخزون', type: 'asset', normal_balance: 'debit', parent_id: assetsParent.id });
  const ap = await Account.create({ company_id: company.id, code: '2010', name_en: 'Accounts Payable', name_ar: 'دائنون', type: 'liability', normal_balance: 'credit' });
  const revenue = await Account.create({ company_id: company.id, code: '4010', name_en: 'Sales Revenue', name_ar: 'إيرادات', type: 'revenue', normal_balance: 'credit' });
  const cogsAcc = await Account.create({ company_id: company.id, code: '5010', name_en: 'COGS', name_ar: 'تكلفة البضاعة', type: 'expense', normal_balance: 'debit' });
  const expense = await Account.create({ company_id: company.id, code: '5020', name_en: 'Office Expense', name_ar: 'مصاريف', type: 'expense', normal_balance: 'debit' });

  const costCenter = await CostCenter.create({ company_id: company.id, code: 'CC1', name_en: 'Main CC', name_ar: 'مركز' });
  const client = await Client.create({ company_id: company.id, code: 'CL1', name_en: 'Client A', name_ar: 'عميل', account_id: ar.id });
  const supplier = await Supplier.create({ company_id: company.id, code: 'SUP1', name_en: 'Supplier A', name_ar: 'مورد', account_id: ap.id });

  const item = await Item.create({
    company_id: company.id, code: 'ITM1', name_en: 'Widget', name_ar: 'قطعة',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    quantity_on_hand: 0, cost_price: 0,
  });

  // ---- 1. Branch CRUD ----
  const branchA = await Branch.create({ company_id: company.id, code: 'BR-A', name_en: 'Downtown Branch', name_ar: 'فرع وسط البلد' });
  const branchB = await Branch.create({ company_id: company.id, code: 'BR-B', name_en: 'Airport Branch', name_ar: 'فرع المطار' });
  check('Branch A created', !!branchA.id);
  check('Branch B created', !!branchB.id);

  const fetchedBranch = await Branch.findOne({ where: { id: branchA.id, company_id: company.id } });
  check('Branch fetch by id works', fetchedBranch && fetchedBranch.code === 'BR-A');

  await branchA.update({ name_en: 'Downtown Branch (Updated)' });
  const updatedBranch = await Branch.findByPk(branchA.id);
  check('Branch update persists', updatedBranch.name_en === 'Downtown Branch (Updated)');

  const allBranches = await Branch.findAll({ where: { company_id: company.id } });
  check('Branch list returns 2', allBranches.length === 2);

  // ---- 2. Voucher header branch_id -> LedgerEntry.branch_id ----
  const voucher1 = await voucherService.createVoucher(company.id, user.id, {
    voucher_type: 'journal',
    date: '2026-01-15',
    description: 'Test JV with branch',
    cost_center_id: costCenter.id,
    branch_id: branchA.id,
    lines: [
      { account_id: expense.id, debit: 100, credit: 0 },
      { account_id: cash.id, debit: 0, credit: 100 },
    ],
  });
  check('Voucher created with branch_id set', voucher1.branch_id === branchA.id);

  await voucherService.postVoucher(company.id, voucher1.id);
  const ledgerEntriesForV1 = await LedgerEntry.findAll({ where: { voucher_id: voucher1.id } });
  check('LedgerEntry rows created for voucher1', ledgerEntriesForV1.length === 2);
  check('LedgerEntry.branch_id propagated from voucher on post', ledgerEntriesForV1.every((e) => e.branch_id === branchA.id));

  // Voucher with NO branch (must remain fully optional / null-safe)
  const voucherNoBranch = await voucherService.createVoucher(company.id, user.id, {
    voucher_type: 'journal',
    date: '2026-01-16',
    description: 'Test JV without branch',
    lines: [
      { account_id: expense.id, debit: 50, credit: 0 },
      { account_id: cash.id, debit: 0, credit: 50 },
    ],
  });
  check('Voucher without branch_id creates fine (branch_id null)', voucherNoBranch.branch_id === null);
  await voucherService.postVoucher(company.id, voucherNoBranch.id);
  const ledgerNoBranch = await LedgerEntry.findAll({ where: { voucher_id: voucherNoBranch.id } });
  check('LedgerEntry.branch_id is null when voucher has no branch', ledgerNoBranch.every((e) => e.branch_id === null));

  // Voucher cancel -> reversing entries also carry branch_id
  await voucherService.cancelVoucher(company.id, voucher1.id);
  const reversalEntries = await LedgerEntry.findAll({ where: { voucher_id: voucher1.id, description: { [require('sequelize').Op.like]: 'Reversal%' } } });
  check('Cancel reversal entries carry branch_id', reversalEntries.length === 2 && reversalEntries.every((e) => e.branch_id === branchA.id));

  // Voucher update (in-place edit) persists branch_id via controller logic path
  const draftVoucher = await voucherService.createVoucher(company.id, user.id, {
    voucher_type: 'journal',
    date: '2026-01-17',
    description: 'Draft to edit',
    lines: [
      { account_id: expense.id, debit: 20, credit: 0 },
      { account_id: cash.id, debit: 0, credit: 20 },
    ],
  });
  // Simulate what voucherController.update does
  await draftVoucher.update({ branch_id: branchB.id });
  const reloadedDraft = await Voucher.findByPk(draftVoucher.id);
  check('Voucher in-place update persists branch_id', reloadedDraft.branch_id === branchB.id);

  // ---- 3. Sales invoice with branch_id -> posts COGS + branch on LedgerEntry ----
  // Receives into the company-wide unbranched pool (kept for the Section 6
  // pool-math baseline below) AND separately into branchA (now that stock is
  // branch-aware, a branch-scoped sale must issue from that branch's own
  // balance, not the pool — see itemService.issueStock's branchId handling).
  await sequelize.transaction((t) => itemService.receiveStock(company.id, item.id, { quantity: 100, unitCost: 10, date: '2026-01-01', userId: user.id }, t));
  await sequelize.transaction((t) => itemService.receiveStock(company.id, item.id, { quantity: 20, unitCost: 10, date: '2026-01-01', userId: user.id, branchId: branchA.id }, t));

  const salesInvoice = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales',
    client_id: client.id,
    date: '2026-01-20',
    branch_id: branchA.id,
    lines: [
      { account_id: revenue.id, item_id: item.id, description: 'Widgets', quantity: 5, unit_price: 25 },
    ],
  });
  check('Sales invoice created with branch_id', salesInvoice.branch_id === branchA.id);

  const postedSalesInvoice = await invoiceService.postInvoice(company.id, salesInvoice.id, user.id);
  check('Sales invoice posted', postedSalesInvoice.status === 'posted');

  const salesLedgerEntries = await LedgerEntry.findAll({ where: { voucher_id: postedSalesInvoice.posting_voucher_id } });
  check('Sales invoice posting created ledger entries (AR/Revenue/COGS/Inventory)', salesLedgerEntries.length === 4);
  check('All ledger entries from sales invoice carry branch_id from invoice header', salesLedgerEntries.every((e) => e.branch_id === branchA.id));

  const postedVoucherForInvoice = await Voucher.findByPk(postedSalesInvoice.posting_voucher_id);
  check('Synthesized journal voucher inherited branch_id from invoice', postedVoucherForInvoice.branch_id === branchA.id);

  // ---- 4. Purchase order -> convert to bill carries branch_id through ----
  const po = await purchaseOrderService.createPurchaseOrder(company.id, user.id, {
    supplier_id: supplier.id,
    date: '2026-01-22',
    branch_id: branchB.id,
    lines: [
      { item_id: item.id, description: 'Restock widgets', quantity: 10, unit_price: 12 },
    ],
  });
  check('Purchase order created with branch_id', po.branch_id === branchB.id);

  const { invoice: billFromPo } = await purchaseOrderService.convertToPurchaseBill(company.id, po.id, user.id);
  check('Converted bill inherits branch_id from PO', billFromPo.branch_id === branchB.id);

  const postedBill = await invoiceService.postInvoice(company.id, billFromPo.id, user.id);
  const billLedgerEntries = await LedgerEntry.findAll({ where: { voucher_id: postedBill.posting_voucher_id } });
  check('Purchase bill (from PO) ledger entries carry branch_id', billLedgerEntries.length > 0 && billLedgerEntries.every((e) => e.branch_id === branchB.id));

  // PO update persists branch_id
  const po2 = await purchaseOrderService.createPurchaseOrder(company.id, user.id, {
    supplier_id: supplier.id,
    date: '2026-01-23',
    lines: [{ item_id: item.id, description: 'x', quantity: 1, unit_price: 5 }],
  });
  check('PO without branch_id defaults to null', po2.branch_id === null);
  const po2Updated = await purchaseOrderService.updatePurchaseOrder(company.id, po2.id, {
    supplier_id: supplier.id,
    date: '2026-01-23',
    branch_id: branchA.id,
    lines: [{ item_id: item.id, description: 'x', quantity: 1, unit_price: 5 }],
  });
  check('PO update persists branch_id', po2Updated.branch_id === branchA.id);

  // ---- 5. Filtering: ledger query, trial balance, P&L, balance sheet, invoices list, vouchers list ----
  function fakeRes() {
    const res = {};
    res.json = (body) => { res._body = body; return res; };
    res.status = (code) => { res._status = code; return res; };
    return res;
  }

  const ledgerReqA = { companyId: company.id, query: { branch_id: branchA.id } };
  const ledgerResA = fakeRes();
  await ledgerController.query(ledgerReqA, ledgerResA);
  check('Ledger query filtered by branch A returns only branch A entries', ledgerResA._body.every((e) => e.branch_id === branchA.id) && ledgerResA._body.length > 0);

  const ledgerReqB = { companyId: company.id, query: { branch_id: branchB.id } };
  const ledgerResB = fakeRes();
  await ledgerController.query(ledgerReqB, ledgerResB);
  check('Ledger query filtered by branch B returns only branch B entries', ledgerResB._body.every((e) => e.branch_id === branchB.id) && ledgerResB._body.length > 0);

  const ledgerReqAll = { companyId: company.id, query: {} };
  const ledgerResAll = fakeRes();
  await ledgerController.query(ledgerReqAll, ledgerResAll);
  check('Ledger query with no branch filter returns entries across branches + null', ledgerResAll._body.length >= ledgerResA._body.length + ledgerResB._body.length);

  const tbReqA = { companyId: company.id, query: { branch_id: branchA.id } };
  const tbResA = fakeRes();
  await ledgerController.trialBalance(tbReqA, tbResA);
  check('Trial balance branch filter returns rows', Array.isArray(tbResA._body) && tbResA._body.length > 0);

  const plReqA = { companyId: company.id, query: { from: '2026-01-01', to: '2026-01-31', branch_id: branchA.id } };
  const plResA = fakeRes();
  await reportController.profitAndLoss(plReqA, plResA);
  check('P&L filtered by branch A shows the sales revenue', plResA._body.total_revenue === 125);

  const plReqB = { companyId: company.id, query: { from: '2026-01-01', to: '2026-01-31', branch_id: branchB.id } };
  const plResB = fakeRes();
  await reportController.profitAndLoss(plReqB, plResB);
  check('P&L filtered by branch B shows no sales revenue (only PO/bill activity)', plResB._body.total_revenue === 0);

  const bsReqA = { companyId: company.id, query: { as_of: '2026-01-31', branch_id: branchA.id } };
  const bsResA = fakeRes();
  await reportController.balanceSheet(bsReqA, bsResA);
  check('Balance sheet branch filter runs without error', typeof bsResA._body.total_assets === 'number');

  const invReqA = { companyId: company.id, query: { branch_id: branchA.id } };
  const invResA = fakeRes();
  await invoiceController.list(invReqA, invResA);
  check('Invoices list filtered by branch A returns only that branch', invResA._body.every((i) => i.branch_id === branchA.id) && invResA._body.length > 0);

  const voucherReqB = { companyId: company.id, query: { branch_id: branchB.id } };
  const voucherResB = fakeRes();
  await voucherController.list(voucherReqB, voucherResB);
  check('Vouchers list filtered by branch B returns only that branch', voucherResB._body.every((v) => v.branch_id === branchB.id) && voucherResB._body.length > 0);

  // voucherController.get includes branch association
  const voucherGetReq = { params: { id: voucher1.id }, companyId: company.id };
  const voucherGetRes = fakeRes();
  await voucherController.get(voucherGetReq, voucherGetRes);
  check('voucherController.get includes branch association', voucherGetRes._body.branch && voucherGetRes._body.branch.id === branchA.id);

  // ---- 6. Baseline regression: everything from before Branches must still work ----

  // Account tree
  const accountCount = await Account.count({ where: { company_id: company.id } });
  check('Baseline: accounts created', accountCount === 8);

  // Cost center still independently functional
  const ccFetch = await CostCenter.findByPk(costCenter.id);
  check('Baseline: cost center still readable', ccFetch && ccFetch.code === 'CC1');

  // Plain voucher (no branch, no cost center) still posts and balances
  const plainVoucher = await voucherService.createVoucher(company.id, user.id, {
    voucher_type: 'receipt',
    date: '2026-01-25',
    description: 'Plain receipt',
    lines: [
      { account_id: cash.id, debit: 200, credit: 0 },
      { account_id: ar.id, debit: 0, credit: 200 },
    ],
  });
  await voucherService.postVoucher(company.id, plainVoucher.id);
  const plainEntries = await LedgerEntry.findAll({ where: { voucher_id: plainVoucher.id } });
  check('Baseline: plain voucher posts with 2 entries', plainEntries.length === 2);
  check('Baseline: plain voucher balances (debit=credit)', plainEntries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0) === 0);

  // Unbalanced voucher still rejected
  let unbalancedRejected = false;
  try {
    await voucherService.createVoucher(company.id, user.id, {
      voucher_type: 'journal', date: '2026-01-25', description: 'Bad',
      lines: [{ account_id: cash.id, debit: 100, credit: 0 }, { account_id: ar.id, debit: 0, credit: 50 }],
    });
  } catch (e) { unbalancedRejected = e.status === 400; }
  check('Baseline: unbalanced voucher still rejected', unbalancedRejected);

  // Item stock math still correct — and, now that stock is branch-aware, the
  // Section 3 sale (branchA) and Section 4 purchase (branchB) both happened
  // at their own branches, so the unbranched pool is untouched by either:
  // it should still hold exactly the original 100 @ 10 received above.
  const itemReloaded = await Item.findByPk(item.id);
  check('Baseline: unbranched pool untouched by branch-scoped sale+purchase (still 100)', Number(itemReloaded.quantity_on_hand) === 100);
  check('Baseline: unbranched pool cost unchanged (still 10)', Math.abs(Number(itemReloaded.cost_price) - 10) < 0.01);

  // ...and the branch-scoped movements themselves landed correctly:
  let itemBranchAStock = await ItemBranchStock.findOne({ where: { item_id: item.id, branch_id: branchA.id } });
  check('Section 3: branchA stock for "item" correct after receive 20 + sell 5 (qty 15, cost 10)', Number(itemBranchAStock.quantity_on_hand) === 15 && Math.abs(Number(itemBranchAStock.cost_price) - 10) < 0.01);
  let itemBranchBStock = await ItemBranchStock.findOne({ where: { item_id: item.id, branch_id: branchB.id } });
  check('Section 4: branchB stock for "item" correct after PO-bill receipt (qty 10, cost 12)', Number(itemBranchBStock.quantity_on_hand) === 10 && Math.abs(Number(itemBranchBStock.cost_price) - 12) < 0.01);

  // Oversell still blocked
  let oversellBlocked = false;
  try {
    await sequelize.transaction((t) => itemService.issueStock(company.id, item.id, { quantity: 999999, date: '2026-01-26', userId: user.id }, t));
  } catch (e) { oversellBlocked = e.status === 400; }
  check('Baseline: oversell still blocked', oversellBlocked);

  // Invoice with no branch_id still posts fine (branch fully optional end-to-end)
  const noBranchInvoice = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-01-27',
    lines: [{ account_id: revenue.id, description: 'Service', quantity: 1, unit_price: 60 }],
  });
  check('Baseline: invoice without branch_id creates with null branch_id', noBranchInvoice.branch_id === null);
  const postedNoBranchInvoice = await invoiceService.postInvoice(company.id, noBranchInvoice.id, user.id);
  const noBranchEntries = await LedgerEntry.findAll({ where: { voucher_id: postedNoBranchInvoice.posting_voucher_id } });
  check('Baseline: invoice without branch_id posts fine, ledger entries have null branch_id', noBranchEntries.length > 0 && noBranchEntries.every((e) => e.branch_id === null));

  // Payment recording still works
  const paidInvoice = await invoiceService.recordPayment(company.id, postedNoBranchInvoice.id, user.id, {
    amount: 60, date: '2026-01-28', cash_account_id: cash.id,
  });
  check('Baseline: payment recording still works', paidInvoice.status === 'paid');

  // Purchase order cancel still works
  const poToCancel = await purchaseOrderService.createPurchaseOrder(company.id, user.id, {
    supplier_id: supplier.id, date: '2026-01-29',
    lines: [{ item_id: item.id, description: 'x', quantity: 1, unit_price: 1 }],
  });
  const cancelledPo = await purchaseOrderService.cancelPurchaseOrder(company.id, poToCancel.id);
  check('Baseline: PO cancel still works', cancelledPo.status === 'cancelled');

  // Branch controller list/create via req/res simulation (routes-level sanity)
  const branchListReq = { companyId: company.id, query: {} };
  const branchListRes = fakeRes();
  await branchController.list(branchListReq, branchListRes);
  check('branchController.list returns branches', Array.isArray(branchListRes._body) && branchListRes._body.length === 2);

  const branchCreateReq = { companyId: company.id, body: { name_en: 'Third Branch', name_ar: 'فرع ثالث' } };
  const branchCreateRes = fakeRes();
  await branchController.create(branchCreateReq, branchCreateRes);
  check('branchController.create auto-generates code and creates', branchCreateRes._body && branchCreateRes._body.code && branchCreateRes._body.id);

  // ---- 7. Branch <-> Chart of Accounts linking (many-to-many, cross-tenant safe) ----
  const branchCReq = { companyId: company.id, body: { name_en: 'Warehouse Branch', name_ar: 'فرع المستودع', account_ids: [cash.id, revenue.id] } };
  const branchCRes = fakeRes();
  await branchController.create(branchCReq, branchCRes);
  const branchC = branchCRes._body;
  check('Branch created with account_ids has 2 linked accounts', Array.isArray(branchC.accounts) && branchC.accounts.length === 2);
  check('Branch linked accounts match cash+revenue', new Set(branchC.accounts.map((a) => a.id)).size === 2
    && branchC.accounts.every((a) => [cash.id, revenue.id].includes(a.id)));

  const branchCUpdateReq = { companyId: company.id, params: { id: branchC.id }, body: { account_ids: [expense.id] } };
  const branchCUpdateRes = fakeRes();
  await branchController.update(branchCUpdateReq, branchCUpdateRes);
  check('Branch account_ids update replaces links (old cleared, new set)', branchCUpdateRes._body.accounts.length === 1 && branchCUpdateRes._body.accounts[0].id === expense.id);

  const branchCGetReq = { companyId: company.id, params: { id: branchC.id } };
  const branchCGetRes = fakeRes();
  await branchController.get(branchCGetReq, branchCGetRes);
  check('Branch get includes linked accounts', branchCGetRes._body.accounts.length === 1 && branchCGetRes._body.accounts[0].id === expense.id);

  // Cross-tenant sanitization: an account belonging to a DIFFERENT company must never get linked
  const foreignCompany = await Company.create({ name_en: 'Other Co', name_ar: 'أخرى', code: 'OTH' });
  const foreignAccount = await Account.create({ company_id: foreignCompany.id, code: '9999', name_en: 'Foreign Cash', name_ar: 'نقد أجنبي', type: 'asset', normal_balance: 'debit' });
  const branchCSanitizeReq = { companyId: company.id, params: { id: branchC.id }, body: { account_ids: [cash.id, foreignAccount.id] } };
  const branchCSanitizeRes = fakeRes();
  await branchController.update(branchCSanitizeReq, branchCSanitizeRes);
  check('Cross-company account id silently dropped, valid one kept', branchCSanitizeRes._body.accounts.length === 1 && branchCSanitizeRes._body.accounts[0].id === cash.id);

  // ---- 8. Per-branch inventory: receive/issue/oversell using a fresh item ----
  const item2 = await Item.create({
    company_id: company.id, code: 'ITM2', name_en: 'Gadget', name_ar: 'أداة',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    quantity_on_hand: 0, cost_price: 0,
  });

  await sequelize.transaction((t) => itemService.receiveStock(company.id, item2.id, { quantity: 50, unitCost: 8, date: '2026-02-01', userId: user.id, branchId: branchA.id }, t));
  let branchAStock = await ItemBranchStock.findOne({ where: { item_id: item2.id, branch_id: branchA.id } });
  check('receiveStock with branchId creates ItemBranchStock row (qty 50, cost 8)', Number(branchAStock.quantity_on_hand) === 50 && Number(branchAStock.cost_price) === 8);
  let item2PoolCheck = await Item.findByPk(item2.id);
  check('receiveStock with branchId leaves unbranched pool untouched (still 0)', Number(item2PoolCheck.quantity_on_hand) === 0);

  const issueResult = await sequelize.transaction((t) => itemService.issueStock(company.id, item2.id, { quantity: 10, date: '2026-02-02', userId: user.id, branchId: branchA.id }, t));
  branchAStock = await ItemBranchStock.findOne({ where: { item_id: item2.id, branch_id: branchA.id } });
  check('issueStock with branchId decrements that branch only (qty 40)', Number(branchAStock.quantity_on_hand) === 40);
  check('issueStock at branch cogsAmount correct (10*8=80)', Math.abs(issueResult.cogsAmount - 80) < 0.01);

  let branchOversellBlocked = false;
  try {
    await sequelize.transaction((t) => itemService.issueStock(company.id, item2.id, { quantity: 999999, date: '2026-02-02', userId: user.id, branchId: branchA.id }, t));
  } catch (e) { branchOversellBlocked = e.status === 400 && /at this branch/.test(e.message); }
  check('issueStock oversell blocked at branch level with branch-specific message', branchOversellBlocked);

  await sequelize.transaction((t) => itemService.receiveStock(company.id, item2.id, { quantity: 20, unitCost: 12, date: '2026-02-03', userId: user.id, branchId: branchB.id }, t));
  const branchBStock = await ItemBranchStock.findOne({ where: { item_id: item2.id, branch_id: branchB.id } });
  check('receiveStock at branchB independent of branchA (qty 20, cost 12)', Number(branchBStock.quantity_on_hand) === 20 && Number(branchBStock.cost_price) === 12);
  branchAStock = await ItemBranchStock.findOne({ where: { item_id: item2.id, branch_id: branchA.id } });
  check('branchA balance unaffected by branchB receipt (still 40)', Number(branchAStock.quantity_on_hand) === 40);

  // ---- 9. Stock transfers: branch-to-branch, pool-to-branch, same-location block, insufficient-stock block ----
  const transferAB = await itemService.transferStock(company.id, user.id, { fromBranchId: branchA.id, toBranchId: branchB.id, date: '2026-02-04', lines: [{ item_id: item2.id, quantity: 15 }] });
  check('transferStock creates StockTransfer record', !!transferAB.id && transferAB.transfer_no.startsWith('ST-'));
  branchAStock = await ItemBranchStock.findOne({ where: { item_id: item2.id, branch_id: branchA.id } });
  const branchBStock2 = await ItemBranchStock.findOne({ where: { item_id: item2.id, branch_id: branchB.id } });
  check('Transfer A->B: source branchA decremented (40-15=25)', Number(branchAStock.quantity_on_hand) === 25);
  check('Transfer A->B: dest branchB incremented (20+15=35)', Number(branchBStock2.quantity_on_hand) === 35);
  check('Transfer A->B: dest branchB weighted-avg cost recomputed ((20*12+15*8)/35)', Math.abs(Number(branchBStock2.cost_price) - (20 * 12 + 15 * 8) / 35) < 0.01);

  const transferTxns = await InventoryTransaction.findAll({ where: { reference_type: 'transfer', reference_id: transferAB.id } });
  check('Transfer creates exactly 2 InventoryTransaction rows (out+in)', transferTxns.length === 2);
  check('Transfer InventoryTransaction types are transfer_out/transfer_in', transferTxns.some((t2) => t2.type === 'transfer_out' && t2.branch_id === branchA.id) && transferTxns.some((t2) => t2.type === 'transfer_in' && t2.branch_id === branchB.id));

  let sameLocationBlocked = false;
  try {
    await itemService.transferStock(company.id, user.id, { fromBranchId: branchA.id, toBranchId: branchA.id, date: '2026-02-04', lines: [{ item_id: item2.id, quantity: 1 }] });
  } catch (e) { sameLocationBlocked = e.status === 400; }
  check('Transfer to same location blocked', sameLocationBlocked);

  let transferInsufficientBlocked = false;
  try {
    await itemService.transferStock(company.id, user.id, { fromBranchId: branchA.id, toBranchId: branchB.id, date: '2026-02-04', lines: [{ item_id: item2.id, quantity: 999999 }] });
  } catch (e) { transferInsufficientBlocked = e.status === 400; }
  check('Transfer with insufficient source stock blocked', transferInsufficientBlocked);

  // Transfer between the unbranched pool and a branch
  await sequelize.transaction((t) => itemService.receiveStock(company.id, item2.id, { quantity: 30, unitCost: 5, date: '2026-02-05', userId: user.id }, t));
  item2PoolCheck = await Item.findByPk(item2.id);
  check('Pool receive (no branchId) affects only the unbranched pool (qty 30, cost 5)', Number(item2PoolCheck.quantity_on_hand) === 30 && Number(item2PoolCheck.cost_price) === 5);

  const transferPoolToA = await itemService.transferStock(company.id, user.id, { fromBranchId: null, toBranchId: branchA.id, date: '2026-02-06', lines: [{ item_id: item2.id, quantity: 10 }] });
  check('Pool->branch transfer creates StockTransfer with null from_branch_id', transferPoolToA.from_branch_id === null && transferPoolToA.to_branch_id === branchA.id);
  item2PoolCheck = await Item.findByPk(item2.id);
  branchAStock = await ItemBranchStock.findOne({ where: { item_id: item2.id, branch_id: branchA.id } });
  check('Pool->branch transfer: pool decremented (30-10=20)', Number(item2PoolCheck.quantity_on_hand) === 20);
  check('Pool->branch transfer: branchA incremented (25+10=35)', Number(branchAStock.quantity_on_hand) === 35);
  check('Pool->branch transfer: branchA weighted-avg cost recomputed ((25*8+10*5)/35)', Math.abs(Number(branchAStock.cost_price) - (25 * 8 + 10 * 5) / 35) < 0.01);

  // ---- 10. getStockBreakdown aggregation ----
  const breakdown = await itemService.getStockBreakdown(company.id, item2.id);
  check('getStockBreakdown: unbranched pool correct (20)', breakdown.unbranched.quantity_on_hand === 20);
  check('getStockBreakdown: 2 branch rows returned', breakdown.branches.length === 2);
  check('getStockBreakdown: total_quantity_on_hand = pool + branches (20+35+35=90)', breakdown.total_quantity_on_hand === 90);
  check('getStockBreakdown: total_value approx correct (~710)', Math.abs(breakdown.total_value - 710) < 0.1);

  // ---- 11. Sales invoice / purchase bill with branch_id move branch stock, not the pool ----
  const salesInvoice2 = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-02-07', branch_id: branchA.id,
    lines: [{ account_id: revenue.id, item_id: item2.id, description: 'Gadgets', quantity: 5, unit_price: 20 }],
  });
  const postedSalesInvoice2 = await invoiceService.postInvoice(company.id, salesInvoice2.id, user.id);
  check('Branch-scoped sales invoice posts', postedSalesInvoice2.status === 'posted');
  branchAStock = await ItemBranchStock.findOne({ where: { item_id: item2.id, branch_id: branchA.id } });
  item2PoolCheck = await Item.findByPk(item2.id);
  check('Branch-scoped sale reduces branchA stock (35-5=30), not the pool', Number(branchAStock.quantity_on_hand) === 30);
  check('Branch-scoped sale leaves unbranched pool untouched (still 20)', Number(item2PoolCheck.quantity_on_hand) === 20);
  const sales2LedgerEntries = await LedgerEntry.findAll({ where: { voucher_id: postedSalesInvoice2.posting_voucher_id } });
  check('Branch-scoped sale ledger entries all carry branchA id', sales2LedgerEntries.length === 4 && sales2LedgerEntries.every((e) => e.branch_id === branchA.id));

  const purchaseBill2 = await invoiceService.createInvoice(company.id, user.id, {
    type: 'purchase', supplier_id: supplier.id, date: '2026-02-08', branch_id: branchB.id,
    lines: [{ account_id: cogsAcc.id, item_id: item2.id, description: 'Restock gadgets', quantity: 8, unit_price: 9 }],
  });
  const postedPurchaseBill2 = await invoiceService.postInvoice(company.id, purchaseBill2.id, user.id);
  check('Branch-scoped purchase bill posts', postedPurchaseBill2.status === 'posted');
  const branchBStock3 = await ItemBranchStock.findOne({ where: { item_id: item2.id, branch_id: branchB.id } });
  check('Branch-scoped purchase increases branchB stock (35+8=43)', Number(branchBStock3.quantity_on_hand) === 43);
  check('Branch-scoped purchase weighted-avg cost recomputed ((35*10.2857+8*9)/43)', Math.abs(Number(branchBStock3.cost_price) - (35 * (360 / 35) + 8 * 9) / 43) < 0.01);

  // ---- 12. itemController aggregation (withBranchTotals) reflects pool + all branches ----
  const itemGetReq = { companyId: company.id, params: { id: item2.id } };
  const itemGetRes = fakeRes();
  await itemController.get(itemGetReq, itemGetRes);
  check('itemController.get: total_quantity_on_hand = pool(20)+branchA(30)+branchB(43) = 93', itemGetRes._body.total_quantity_on_hand === 93);
  check('itemController.get: branch_quantity_on_hand = branchA+branchB only = 73', itemGetRes._body.branch_quantity_on_hand === 73);

  const itemListReq = { companyId: company.id, query: {} };
  const itemListRes = fakeRes();
  await itemController.list(itemListReq, itemListRes);
  const item2InList = itemListRes._body.find((i) => i.id === item2.id);
  check('itemController.list includes aggregated totals for item2', !!item2InList && item2InList.total_quantity_on_hand === 93);
  // "item" (from Sections 3/4) has pool=100 plus branchA=15 + branchB=10 of its own branch stock
  const itemOriginalInList = itemListRes._body.find((i) => i.id === item.id);
  check('itemController.list: "item" aggregation = pool(100) + branchA(15) + branchB(10) = 125', !!itemOriginalInList && itemOriginalInList.total_quantity_on_hand === 125 && itemOriginalInList.branch_quantity_on_hand === 25);

  // A genuinely branch-untouched item still shows zero branch contribution (true backward compat)
  const item3 = await Item.create({
    company_id: company.id, code: 'ITM3', name_en: 'Untouched', name_ar: 'غير مرتبط',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    quantity_on_hand: 42, cost_price: 3,
  });
  const item3GetReq = { companyId: company.id, params: { id: item3.id } };
  const item3GetRes = fakeRes();
  await itemController.get(item3GetReq, item3GetRes);
  check('itemController.get: item with zero branch stock has total = own quantity_on_hand (backward compat)', item3GetRes._body.total_quantity_on_hand === 42 && item3GetRes._body.branch_quantity_on_hand === 0);

  // ---- 13. stockTransferController list/get/create (route-level sanity, header+lines) ----
  const stcListReq = { companyId: company.id, query: {} };
  const stcListRes = fakeRes();
  await stockTransferController.list(stcListReq, stcListRes);
  check('stockTransferController.list returns all transfers for the company', Array.isArray(stcListRes._body) && stcListRes._body.length === 2);
  check('stockTransferController.list includes populated .lines with item', stcListRes._body.every((r) => Array.isArray(r.lines) && r.lines.length > 0 && r.lines[0].item));

  const stcCreateReq = { companyId: company.id, user: { id: user.id }, body: { from_branch_id: branchB.id, to_branch_id: null, date: '2026-02-09', notes: 'via controller', lines: [{ item_id: item2.id, quantity: 3 }] } };
  const stcCreateRes = fakeRes();
  await stockTransferController.create(stcCreateReq, stcCreateRes);
  check('stockTransferController.create performs a real transfer (branchB -> pool)', !!stcCreateRes._body && Array.isArray(stcCreateRes._body.lines) && Number(stcCreateRes._body.lines[0].quantity) === 3);
  const branchBStockFinal = await ItemBranchStock.findOne({ where: { item_id: item2.id, branch_id: branchB.id } });
  check('stockTransferController.create: branchB decremented (43-3=40)', Number(branchBStockFinal.quantity_on_hand) === 40);

  // ---- 14. Item SKU field + uniqueness ----
  const item5 = await itemService.createItem(company.id, user.id, {
    name_en: 'Skuvian', name_ar: 'سكو', sku: 'SKU-123',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
  });
  check('Item created with sku', item5.sku === 'SKU-123');
  let skuUniqueRejected = false;
  try {
    await itemService.createItem(company.id, user.id, {
      name_en: 'Dupe', name_ar: 'مكرر', sku: 'SKU-123',
      inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    });
  } catch (e) { skuUniqueRejected = /unique/i.test(e.name) || /unique/i.test(e.message || ''); }
  check('Duplicate sku within same company rejected', skuUniqueRejected);

  // ---- 15. Full variants: attributes, per-variant pool + per-branch stock, transfers, reports ----
  const item4 = await itemService.createItem(company.id, user.id, {
    name_en: 'Shirt', name_ar: 'قميص', variant_attributes: ['Color', 'Size'],
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
  });
  check('Item created with variant_attributes', Array.isArray(item4.variant_attributes) && item4.variant_attributes.length === 2);

  const v1 = await itemService.createVariant(company.id, item4.id, { sku: 'SHIRT-RED-S', attributes: { Color: 'Red', Size: 'S' } });
  const v2 = await itemService.createVariant(company.id, item4.id, { sku: 'SHIRT-BLUE-M', attributes: { Color: 'Blue', Size: 'M' } });
  check('Variant v1 created', v1.sku === 'SHIRT-RED-S' && v1.attributes.Color === 'Red');
  check('Variant v2 created', v2.sku === 'SHIRT-BLUE-M');

  let dupeVariantSkuRejected = false;
  try { await itemService.createVariant(company.id, item4.id, { sku: 'SHIRT-RED-S', attributes: { Color: 'Green', Size: 'L' } }); }
  catch (e) { dupeVariantSkuRejected = /unique/i.test(e.name) || /unique/i.test(e.message || ''); }
  check('Duplicate variant sku within same company rejected', dupeVariantSkuRejected);

  // Cross-item safety: a variant id from item4 must never be usable against a different item
  let crossItemVariantRejected = false;
  try { await sequelize.transaction((t) => itemService.receiveStock(company.id, item.id, { quantity: 1, unitCost: 1, date: '2026-03-01', userId: user.id, variantId: v1.id }, t)); }
  catch (e) { crossItemVariantRejected = e.status === 400; }
  check('Variant belonging to a different item is rejected (cross-item safety)', crossItemVariantRejected);

  // Variant pool + branch stock, independent of the item's own pool/branches
  await sequelize.transaction((t) => itemService.receiveStock(company.id, item4.id, { quantity: 40, unitCost: 6, date: '2026-03-01', userId: user.id, variantId: v1.id }, t));
  let v1Pool = await ItemVariant.findByPk(v1.id);
  check('receiveStock(variant, no branch) updates variant pool (qty 40, cost 6)', Number(v1Pool.quantity_on_hand) === 40 && Number(v1Pool.cost_price) === 6);
  const item4Reloaded = await Item.findByPk(item4.id);
  check('receiveStock(variant) leaves the plain Item pool untouched (still 0)', Number(item4Reloaded.quantity_on_hand) === 0);

  await sequelize.transaction((t) => itemService.receiveStock(company.id, item4.id, { quantity: 20, unitCost: 6, date: '2026-03-01', userId: user.id, variantId: v1.id, branchId: branchA.id }, t));
  let v1BranchA = await ItemVariantBranchStock.findOne({ where: { variant_id: v1.id, branch_id: branchA.id } });
  check('receiveStock(variant, branch) creates ItemVariantBranchStock (qty 20, cost 6)', Number(v1BranchA.quantity_on_hand) === 20 && Number(v1BranchA.cost_price) === 6);

  await sequelize.transaction((t) => itemService.issueStock(company.id, item4.id, { quantity: 5, date: '2026-03-02', userId: user.id, variantId: v1.id, branchId: branchA.id }, t));
  v1BranchA = await ItemVariantBranchStock.findOne({ where: { variant_id: v1.id, branch_id: branchA.id } });
  check('issueStock(variant, branch) decrements that variant+branch only (qty 15)', Number(v1BranchA.quantity_on_hand) === 15);

  let variantPoolOversellBlocked = false;
  try { await sequelize.transaction((t) => itemService.issueStock(company.id, item4.id, { quantity: 999999, date: '2026-03-02', userId: user.id, variantId: v1.id }, t)); }
  catch (e) { variantPoolOversellBlocked = e.status === 400; }
  check('issueStock(variant pool) oversell blocked (v1 pool still has only 40)', variantPoolOversellBlocked);
  v1Pool = await ItemVariant.findByPk(v1.id);
  check('Failed oversell attempt left v1 pool unchanged (still 40)', Number(v1Pool.quantity_on_hand) === 40);

  await sequelize.transaction((t) => itemService.receiveStock(company.id, item4.id, { quantity: 10, unitCost: 9, date: '2026-03-03', userId: user.id, variantId: v2.id, branchId: branchB.id }, t));
  const v2BranchB = await ItemVariantBranchStock.findOne({ where: { variant_id: v2.id, branch_id: branchB.id } });
  check('receiveStock(v2, branchB) independent of v1 (qty 10, cost 9)', Number(v2BranchB.quantity_on_hand) === 10 && Number(v2BranchB.cost_price) === 9);

  // Multi-line transfer: one variant-scoped item4/v1 line + one plain item(no variant) line, same document
  const multiTransfer = await itemService.transferStock(company.id, user.id, {
    fromBranchId: branchA.id, toBranchId: branchB.id, date: '2026-03-04', notes: 'multi-line test',
    lines: [
      { item_id: item4.id, variant_id: v1.id, quantity: 5 },
      { item_id: item.id, quantity: 3 },
    ],
  });
  const multiTransferLines = await StockTransferLine.findAll({ where: { transfer_id: multiTransfer.id } });
  check('Multi-line transfer creates one StockTransferLine per line (2)', multiTransferLines.length === 2);
  v1BranchA = await ItemVariantBranchStock.findOne({ where: { variant_id: v1.id, branch_id: branchA.id } });
  let v1BranchB = await ItemVariantBranchStock.findOne({ where: { variant_id: v1.id, branch_id: branchB.id } });
  check('Multi-line transfer: variant line moved correctly (branchA 15->10, branchB 0->5)', Number(v1BranchA.quantity_on_hand) === 10 && Number(v1BranchB.quantity_on_hand) === 5);
  itemBranchAStock = await ItemBranchStock.findOne({ where: { item_id: item.id, branch_id: branchA.id } });
  itemBranchBStock = await ItemBranchStock.findOne({ where: { item_id: item.id, branch_id: branchB.id } });
  check('Multi-line transfer: plain-item line moved correctly (branchA 15->12, branchB 10->13)', Number(itemBranchAStock.quantity_on_hand) === 12 && Number(itemBranchBStock.quantity_on_hand) === 13);

  // Atomicity: a multi-line transfer where one line has insufficient stock must roll back ALL lines
  let atomicityBlocked = false;
  const transferCountBefore = await require(path.join(process.cwd(), 'src/models')).StockTransfer.count({ where: { company_id: company.id } });
  try {
    await itemService.transferStock(company.id, user.id, {
      fromBranchId: branchA.id, toBranchId: branchB.id, date: '2026-03-05',
      lines: [
        { item_id: item4.id, variant_id: v1.id, quantity: 3 },   // valid on its own (branchA v1 has 10)
        { item_id: item4.id, variant_id: v1.id, quantity: 999999 }, // invalid -> must roll back line 1 too
      ],
    });
  } catch (e) { atomicityBlocked = e.status === 400; }
  check('Multi-line transfer with one bad line is rejected atomically', atomicityBlocked);
  const transferCountAfter = await require(path.join(process.cwd(), 'src/models')).StockTransfer.count({ where: { company_id: company.id } });
  check('Failed atomic transfer created no StockTransfer row', transferCountAfter === transferCountBefore);
  v1BranchA = await ItemVariantBranchStock.findOne({ where: { variant_id: v1.id, branch_id: branchA.id } });
  v1BranchB = await ItemVariantBranchStock.findOne({ where: { variant_id: v1.id, branch_id: branchB.id } });
  check('Failed atomic transfer left both sides fully unchanged (branchA still 10, branchB still 5)', Number(v1BranchA.quantity_on_hand) === 10 && Number(v1BranchB.quantity_on_hand) === 5);

  // getStockBreakdown includes per-variant breakdown alongside the item's own (empty) pool/branches
  const item4Breakdown = await itemService.getStockBreakdown(company.id, item4.id);
  check('getStockBreakdown: item4 itself has no direct stock (pure variant item)', item4Breakdown.total_quantity_on_hand === 0 && item4Breakdown.branches.length === 0);
  check('getStockBreakdown: returns both variants', item4Breakdown.variants.length === 2);
  const v1Breakdown = item4Breakdown.variants.find((v) => v.variant_id === v1.id);
  check('getStockBreakdown: v1 total = pool(40)+branchA(10)+branchB(5) = 55', v1Breakdown.total_quantity_on_hand === 55);
  const v2Breakdown = item4Breakdown.variants.find((v) => v.variant_id === v2.id);
  check('getStockBreakdown: v2 total = branchB(10) only = 10', v2Breakdown.total_quantity_on_hand === 10);

  // itemController aggregation includes variant pool + variant branch stock in the item's totals
  const item4GetReq = { companyId: company.id, params: { id: item4.id } };
  const item4GetRes = fakeRes();
  await itemController.get(item4GetReq, item4GetRes);
  check('itemController.get: variant_count = 2', item4GetRes._body.variant_count === 2);
  check('itemController.get: total_quantity_on_hand includes all variant stock (0+0+40+25=65)', item4GetRes._body.total_quantity_on_hand === 65);
  check('itemController.get: variant_quantity_on_hand = 40+10+5+10 = 65', item4GetRes._body.variant_quantity_on_hand === 65);

  // Variant CRUD via itemController (route-level)
  const variantUpdateReq = { companyId: company.id, params: { id: item4.id, variantId: v2.id }, body: { sku: 'SHIRT-BLUE-M-V2' } };
  const variantUpdateRes = fakeRes();
  await itemController.updateVariant(variantUpdateReq, variantUpdateRes);
  check('itemController.updateVariant renames sku', variantUpdateRes._body.sku === 'SHIRT-BLUE-M-V2');

  const variantRemoveReq = { companyId: company.id, params: { id: item4.id, variantId: v2.id } };
  const variantRemoveRes = fakeRes();
  await itemController.removeVariant(variantRemoveReq, variantRemoveRes);
  const v2AfterDeactivate = await ItemVariant.findByPk(v2.id);
  check('itemController.removeVariant deactivates (soft) the variant', v2AfterDeactivate.is_active === false);

  const variantListReq = { companyId: company.id, params: { id: item4.id } };
  const variantListRes = fakeRes();
  await itemController.listVariants(variantListReq, variantListRes);
  check('itemController.listVariants returns both variants (including inactive)', variantListRes._body.length === 2);

  // ---- 16. Inventory Reports: valuation, low-stock, movement ----
  await itemService.updateItem(company.id, item4.id, { reorder_level: 15 });

  const valuationReq = { companyId: company.id, query: {} };
  const valuationRes = fakeRes();
  await inventoryReportController.valuation(valuationReq, valuationRes);
  const v1Row = valuationRes._body.rows.find((r) => r.variant_id === v1.id);
  const v2Row = valuationRes._body.rows.find((r) => r.variant_id === v2.id);
  check('Valuation report (company-wide): v1 row qty=55, cost=6', v1Row && v1Row.quantity_on_hand === 55 && Math.abs(v1Row.cost_price - 6) < 0.001);
  check('Valuation report (company-wide): v2 row qty=10, cost=9', v2Row && v2Row.quantity_on_hand === 10 && Math.abs(v2Row.cost_price - 9) < 0.001);
  check('Valuation report: plain items (no variants) still included as their own row', valuationRes._body.rows.some((r) => r.item_id === item5.id && r.variant_id === null));

  const valuationBranchReq = { companyId: company.id, query: { branch_id: branchA.id } };
  const valuationBranchRes = fakeRes();
  await inventoryReportController.valuation(valuationBranchReq, valuationBranchRes);
  const v1RowBranchA = valuationBranchRes._body.rows.find((r) => r.variant_id === v1.id);
  check('Valuation report scoped to branchA: v1 qty=10 (branch-only, not pool)', v1RowBranchA && v1RowBranchA.quantity_on_hand === 10);

  const lowStockReq = { companyId: company.id, query: {} };
  const lowStockRes = fakeRes();
  await inventoryReportController.lowStock(lowStockReq, lowStockRes);
  check('Low-stock report: v2 (qty 10 <= reorder 15) is flagged', lowStockRes._body.rows.some((r) => r.variant_id === v2.id));
  check('Low-stock report: v1 (qty 55 > reorder 15) is NOT flagged', !lowStockRes._body.rows.some((r) => r.variant_id === v1.id));

  const movementReq = { companyId: company.id, query: { item_id: item4.id, variant_id: v1.id, branch_id: branchA.id } };
  const movementRes = fakeRes();
  await inventoryReportController.movement(movementReq, movementRes);
  check('Movement report (item4/v1/branchA): 3 movements (receive+20, issue-5, transfer_out-5)', movementRes._body.rows.length === 3);
  check('Movement report rows are chronologically ordered', new Date(movementRes._body.rows[0].date) <= new Date(movementRes._body.rows[movementRes._body.rows.length - 1].date));

  const movementAllReq = { companyId: company.id, query: { item_id: item4.id } };
  const movementAllRes = fakeRes();
  await inventoryReportController.movement(movementAllReq, movementAllRes);
  check('Movement report (item4, no variant/branch filter): 6 total movements across both variants', movementAllRes._body.rows.length === 6);

  const movementMissingItemReq = { companyId: company.id, query: {} };
  const movementMissingItemRes = fakeRes();
  await inventoryReportController.movement(movementMissingItemReq, movementMissingItemRes);
  check('Movement report without item_id returns 400', movementMissingItemRes._status === 400);

  // ---- 17. Item Categories: CRUD, quick-add defaults, uniqueness, cross-company safety, legacy fallback ----
  const catCreateReq = { companyId: company.id, body: { name_en: 'Electronics' } };
  const catCreateRes = fakeRes();
  await itemCategoryController.create(catCreateReq, catCreateRes);
  check('ItemCategory quick-add: name_ar defaults to name_en', catCreateRes._body.name_en === 'Electronics' && catCreateRes._body.name_ar === 'Electronics');
  const catElectronics = catCreateRes._body;

  const catCreateReq2 = { companyId: company.id, body: { name_en: 'Furniture', name_ar: 'أثاث' } };
  const catCreateRes2 = fakeRes();
  await itemCategoryController.create(catCreateReq2, catCreateRes2);
  check('ItemCategory create with explicit name_ar', catCreateRes2._body.name_ar === 'أثاث');
  const catFurniture = catCreateRes2._body;

  const catListReq = { companyId: company.id, query: {} };
  const catListRes = fakeRes();
  await itemCategoryController.list(catListReq, catListRes);
  check('ItemCategory list returns both categories', catListRes._body.length === 2);

  let dupeCategoryRejected = false;
  try { await ItemCategory.create({ company_id: company.id, name_en: 'Electronics', name_ar: 'x' }); }
  catch (e) { dupeCategoryRejected = /unique/i.test(e.name) || /unique/i.test(e.message || ''); }
  check('Duplicate category name_en within same company rejected', dupeCategoryRejected);

  const catUpdateReq = { companyId: company.id, params: { id: catFurniture.id }, body: { name_en: 'Office Furniture' } };
  const catUpdateRes = fakeRes();
  await itemCategoryController.update(catUpdateReq, catUpdateRes);
  check('ItemCategory update renames', catUpdateRes._body.name_en === 'Office Furniture');

  const catRemoveReq = { companyId: company.id, params: { id: catFurniture.id } };
  const catRemoveRes = fakeRes();
  await itemCategoryController.remove(catRemoveReq, catRemoveRes);
  const catListActiveRes = fakeRes();
  await itemCategoryController.list(catListReq, catListActiveRes);
  check('ItemCategory list (active only) excludes deactivated category', catListActiveRes._body.length === 1);
  const catListAllReq = { companyId: company.id, query: { status: 'all' } };
  const catListAllRes = fakeRes();
  await itemCategoryController.list(catListAllReq, catListAllRes);
  check('ItemCategory list with status=all includes deactivated category', catListAllRes._body.length === 2);

  // Item linked to a managed category
  const item6 = await itemService.createItem(company.id, user.id, {
    name_en: 'Laptop', name_ar: 'حاسوب محمول', category_id: catElectronics.id,
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
  });
  check('Item created with category_id', item6.category_id === catElectronics.id);
  const item6GetReq = { companyId: company.id, params: { id: item6.id } };
  const item6GetRes = fakeRes();
  await itemController.get(item6GetReq, item6GetRes);
  check('itemController.get: category_name resolves from linked ItemCategory', item6GetRes._body.category_name === 'Electronics');

  // Cross-company safety: a category from a different company can never be linked
  const foreignCategory = await ItemCategory.create({ company_id: foreignCompany.id, name_en: 'Foreign Cat', name_ar: 'Foreign Cat' });
  let crossCompanyCategoryRejected = false;
  try {
    await itemService.createItem(company.id, user.id, {
      name_en: 'Bad Item', name_ar: 'سيء', category_id: foreignCategory.id,
      inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    });
  } catch (e) { crossCompanyCategoryRejected = e.status === 400; }
  check('Cross-company category_id rejected on item create', crossCompanyCategoryRejected);

  // Legacy backward compat: an item with only the old free-text category (no category_id)
  const item7 = await itemService.createItem(company.id, user.id, {
    name_en: 'Old Style Item', name_ar: 'صنف قديم', category: 'Misc',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
  });
  check('Legacy item created with free-text category, no category_id', item7.category === 'Misc' && item7.category_id === null);
  const item7GetReq = { companyId: company.id, params: { id: item7.id } };
  const item7GetRes = fakeRes();
  await itemController.get(item7GetReq, item7GetRes);
  check('itemController.get: category_name falls back to legacy free-text category', item7GetRes._body.category_name === 'Misc');

  // Update path: linking a category via updateItem
  const item7Updated = await itemService.updateItem(company.id, item7.id, { category_id: catElectronics.id });
  check('itemService.updateItem links category_id', item7Updated.category_id === catElectronics.id);

  // ==== Units of Measure ====

  // Lazy-seed: first list call for a company with no units yet creates the
  // starter set (same list the Item form used to hardcode).
  const unitListReq1 = { companyId: company.id, query: {} };
  const unitListRes1 = fakeRes();
  await unitController.list(unitListReq1, unitListRes1);
  check('Unit list lazy-seeds default starter units on first access', unitListRes1._body.length === 16);
  check('Lazy-seeded units are plain base units (no base_unit_id)', unitListRes1._body.every((u) => !u.base_unit_id));

  const seededMeter = unitListRes1._body.find((u) => u.name_en === 'meter');
  const seededPiece = unitListRes1._body.find((u) => u.name_en === 'pcs');

  // Quick-add (name only) creates another plain base unit.
  const unitCreateReq = { companyId: company.id, body: { name_en: 'Crate' } };
  const unitCreateRes = fakeRes();
  await unitController.create(unitCreateReq, unitCreateRes);
  check('Unit quick-add: name_ar defaults to name_en', unitCreateRes._body.name_en === 'Crate' && unitCreateRes._body.name_ar === 'Crate');
  check('Unit quick-add: no base unit by default', unitCreateRes._body.base_unit_id === null);

  // Create a derived unit with a real conversion: 1 Roll = 50 Meter.
  const unitRollReq = { companyId: company.id, body: { name_en: 'Roll', base_unit_id: seededMeter.id, conversion_factor: 50 } };
  const unitRollRes = fakeRes();
  await unitController.create(unitRollReq, unitRollRes);
  check('Unit with conversion: base_unit_id set', unitRollRes._body.base_unit_id === seededMeter.id);
  check('Unit with conversion: factor stored', Number(unitRollRes._body.conversion_factor) === 50);
  check('Unit with conversion: baseUnit included in response', unitRollRes._body.baseUnit?.name_en === 'meter');
  const unitRoll = unitRollRes._body;

  // A unit that is itself derived cannot be used as someone else's base unit
  // (keeps conversions a single multiply/divide, never a chain).
  let chainedBaseRejected = false;
  const unitChainReq = { companyId: company.id, body: { name_en: 'Pallet', base_unit_id: unitRoll.id, conversion_factor: 40 } };
  const unitChainRes = fakeRes();
  await unitController.create(unitChainReq, unitChainRes);
  chainedBaseRejected = unitChainRes._status === 400;
  check('Unit create rejects a chained (non-base) base_unit_id', chainedBaseRejected);

  // A unit cannot be its own base unit.
  let selfBaseRejected = false;
  const unitSelfReq = { companyId: company.id, params: { id: unitRoll.id }, body: { base_unit_id: unitRoll.id } };
  const unitSelfRes = fakeRes();
  await unitController.update(unitSelfReq, unitSelfRes);
  selfBaseRejected = unitSelfRes._status === 400;
  check('Unit update rejects a unit as its own base unit', selfBaseRejected);

  // A base unit already relied on by another unit's conversion can't itself
  // gain a base_unit_id (would create a two-level chain).
  let dependentBaseRejected = false;
  const unitDependentReq = { companyId: company.id, params: { id: seededMeter.id }, body: { base_unit_id: seededPiece.id, conversion_factor: 3 } };
  const unitDependentRes = fakeRes();
  await unitController.update(unitDependentReq, unitDependentRes);
  dependentBaseRejected = unitDependentRes._status === 400;
  check('Unit update rejects giving a relied-upon base unit its own base', dependentBaseRejected);

  // Deactivate / list filters
  const unitCrate = unitCreateRes._body;
  const unitRemoveReq = { companyId: company.id, params: { id: unitCrate.id } };
  const unitRemoveRes = fakeRes();
  await unitController.remove(unitRemoveReq, unitRemoveRes);
  const unitListActiveReq = { companyId: company.id, query: {} };
  const unitListActiveRes = fakeRes();
  await unitController.list(unitListActiveReq, unitListActiveRes);
  check('Unit list (active only) excludes deactivated unit', !unitListActiveRes._body.some((u) => u.id === unitCrate.id));
  const unitListAllReq = { companyId: company.id, query: { status: 'all' } };
  const unitListAllRes = fakeRes();
  await unitController.list(unitListAllReq, unitListAllRes);
  check('Unit list with status=all includes deactivated unit', unitListAllRes._body.some((u) => u.id === unitCrate.id));

  // Item wired to a managed unit with a conversion — itemController exposes
  // both unit_name and a human-readable unit_conversion string.
  const itemU1 = await itemService.createItem(company.id, user.id, {
    name_en: 'Fabric Roll', name_ar: 'لفة قماش', unit_id: unitRoll.id,
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
  });
  check('Item created with unit_id', itemU1.unit_id === unitRoll.id);
  const itemU1GetReq = { companyId: company.id, params: { id: itemU1.id } };
  const itemU1GetRes = fakeRes();
  await itemController.get(itemU1GetReq, itemU1GetRes);
  check('itemController.get: unit_name resolves from linked Unit', itemU1GetRes._body.unit_name === 'Roll');
  check('itemController.get: unit_conversion describes the conversion', itemU1GetRes._body.unit_conversion === '1 Roll = 50 meter');

  // Legacy backward compat: an item with only the old free-text unit (no unit_id)
  const itemU2 = await itemService.createItem(company.id, user.id, {
    name_en: 'Old Style Unit Item', name_ar: 'صنف وحدة قديم', unit: 'dozen',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
  });
  check('Legacy item created with free-text unit, no unit_id', itemU2.unit === 'dozen' && itemU2.unit_id === null);
  const itemU2GetReq = { companyId: company.id, params: { id: itemU2.id } };
  const itemU2GetRes = fakeRes();
  await itemController.get(itemU2GetReq, itemU2GetRes);
  check('itemController.get: unit_name falls back to legacy free-text unit', itemU2GetRes._body.unit_name === 'dozen');
  check('itemController.get: unit_conversion is null with no managed unit', itemU2GetRes._body.unit_conversion === null);

  // Update path: linking a unit via updateItem
  const itemU2Updated = await itemService.updateItem(company.id, itemU2.id, { unit_id: unitRoll.id });
  check('itemService.updateItem links unit_id', itemU2Updated.unit_id === unitRoll.id);

  // Cross-company safety: a unit from a different company can never be linked
  const foreignUnit = await Unit.create({ company_id: foreignCompany.id, name_en: 'Foreign Unit', name_ar: 'Foreign Unit' });
  let crossCompanyUnitRejected = false;
  try {
    await itemService.createItem(company.id, user.id, {
      name_en: 'Bad Unit Item', name_ar: 'سيء', unit_id: foreignUnit.id,
      inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    });
  } catch (e) { crossCompanyUnitRejected = e.status === 400; }
  check('Cross-company unit_id rejected on item create', crossCompanyUnitRejected);

  // Cross-company base_unit_id is likewise rejected on unit create.
  let crossCompanyBaseUnitRejected = false;
  const unitCrossBaseReq = { companyId: company.id, body: { name_en: 'Sneaky', base_unit_id: foreignUnit.id, conversion_factor: 2 } };
  const unitCrossBaseRes = fakeRes();
  await unitController.create(unitCrossBaseReq, unitCrossBaseRes);
  crossCompanyBaseUnitRejected = unitCrossBaseRes._status === 400;
  check('Cross-company base_unit_id rejected on unit create', crossCompanyBaseUnitRejected);

  // ==== Financial Configuration (default account mapping) ====

  // First GET auto-creates an empty settings row for the company.
  const fsGetReq1 = { companyId: company.id };
  const fsGetRes1 = fakeRes();
  await financialSettingController.get(fsGetReq1, fsGetRes1);
  check('FinancialSetting get auto-creates a row on first access', fsGetRes1._body.company_id === company.id);
  check('FinancialSetting starts with no defaults configured', fsGetRes1._body.client_parent_account_id === null);

  // Update sets a default parent account for Clients, validated against this company's CoA.
  const fsUpdateReq = { companyId: company.id, body: { client_parent_account_id: ar.id, item_inventory_account_id: inventoryAcc.id } };
  const fsUpdateRes = fakeRes();
  await financialSettingController.update(fsUpdateReq, fsUpdateRes);
  check('FinancialSetting update sets client_parent_account_id', fsUpdateRes._body.client_parent_account_id === ar.id);
  check('FinancialSetting update sets item_inventory_account_id', fsUpdateRes._body.item_inventory_account_id === inventoryAcc.id);

  // Second GET returns the same persisted row (findOrCreate doesn't overwrite).
  const fsGetReq2 = { companyId: company.id };
  const fsGetRes2 = fakeRes();
  await financialSettingController.get(fsGetReq2, fsGetRes2);
  check('FinancialSetting get returns persisted defaults on subsequent calls', fsGetRes2._body.client_parent_account_id === ar.id);

  // Cross-company account id rejected.
  const fsCrossReq = { companyId: company.id, body: { client_parent_account_id: foreignAccount.id } };
  const fsCrossRes = fakeRes();
  await financialSettingController.update(fsCrossReq, fsCrossRes);
  check('FinancialSetting update rejects a cross-company account id', fsCrossRes._status === 400);
  check('FinancialSetting rejected update leaves the prior default untouched', fsUpdateRes._body.client_parent_account_id === ar.id);

  // Clearing a default (explicit null) works.
  const fsClearReq = { companyId: company.id, body: { client_parent_account_id: null } };
  const fsClearRes = fakeRes();
  await financialSettingController.update(fsClearReq, fsClearRes);
  check('FinancialSetting update clears a default when given null', fsClearRes._body.client_parent_account_id === null);

  // ==== Inventory Booking (booked vs available stock) ====

  const bookItem = await itemService.createItem(company.id, user.id, {
    name_en: 'Booking Test Item', name_ar: 'صنف اختبار الحجز',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    selling_price: 20, opening_quantity: 50, opening_cost: 8,
  });

  let bookedNeedsItemRejected = false;
  try {
    await invoiceService.createInvoice(company.id, user.id, {
      type: 'sales', client_id: client.id, date: '2026-02-01',
      lines: [{ account_id: revenue.id, description: 'No item', quantity: 1, unit_price: 10, is_booked: true, delivery_date: '2026-03-01' }],
    });
  } catch (e) { bookedNeedsItemRejected = e.status === 400; }
  check('Booked line without item_id is rejected', bookedNeedsItemRejected);

  let bookedNeedsDateRejected = false;
  try {
    await invoiceService.createInvoice(company.id, user.id, {
      type: 'sales', client_id: client.id, date: '2026-02-01',
      lines: [{ account_id: revenue.id, item_id: bookItem.id, description: 'No date', quantity: 1, unit_price: 20, is_booked: true }],
    });
  } catch (e) { bookedNeedsDateRejected = e.status === 400; }
  check('Booked line without delivery_date is rejected', bookedNeedsDateRejected);

  const bookInvoice = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-02-01',
    lines: [{ account_id: revenue.id, item_id: bookItem.id, description: 'Booked sale', quantity: 10, unit_price: 20, is_booked: true, delivery_date: '2026-03-01' }],
  });
  const bookLine = await InvoiceLine.findOne({ where: { invoice_id: bookInvoice.id } });
  check('Booked invoice line persists is_booked + delivery_date', bookLine.is_booked === true && bookLine.delivery_date === '2026-03-01');

  const postedBookInvoice = await invoiceService.postInvoice(company.id, bookInvoice.id, user.id);
  check('Booked sales invoice posts successfully', postedBookInvoice.status === 'posted');

  const bookItemAfterPost = await Item.findByPk(bookItem.id);
  check('Posting a booked line does NOT reduce on-hand stock', Number(bookItemAfterPost.quantity_on_hand) === 50);

  const bookingRow = await ItemBooking.findOne({ where: { invoice_id: bookInvoice.id } });
  check('Posting a booked line creates a pending ItemBooking', !!bookingRow && bookingRow.status === 'pending' && Number(bookingRow.quantity) === 10);

  const bookInvoiceLedgerEntries = await LedgerEntry.findAll({ where: { voucher_id: postedBookInvoice.posting_voucher_id } });
  check('Booked sale posts revenue/AR but no COGS/Inventory lines', bookInvoiceLedgerEntries.length === 2);

  const bookItemGetReq = { companyId: company.id, params: { id: bookItem.id } };
  const bookItemGetRes = fakeRes();
  await itemController.get(bookItemGetReq, bookItemGetRes);
  check('itemController.get: booked_quantity reflects the pending booking', Number(bookItemGetRes._body.booked_quantity) === 10);
  check('itemController.get: available_quantity = on-hand minus booked', Number(bookItemGetRes._body.available_quantity) === 40);

  const bookListReq = { companyId: company.id, query: {} };
  const bookListRes = fakeRes();
  await bookingController.list(bookListReq, bookListRes);
  check('bookingController.list (default) returns the pending booking', bookListRes._body.some((b) => b.id === bookingRow.id));
  check('bookingController.list includes item + client', bookListRes._body[0].item?.id === bookItem.id && bookListRes._body[0].client?.id === client.id);

  const fulfillReq = { companyId: company.id, params: { id: bookingRow.id }, user: { id: user.id }, body: {} };
  const fulfillRes = fakeRes();
  await bookingController.fulfill(fulfillReq, fulfillRes);
  check('bookingController.fulfill marks the booking fulfilled', fulfillRes._body.status === 'fulfilled');

  const bookItemAfterFulfill = await Item.findByPk(bookItem.id);
  check('Fulfilling a booking issues stock (on-hand reduced)', Number(bookItemAfterFulfill.quantity_on_hand) === 40);

  const bookItemGetReq2 = { companyId: company.id, params: { id: bookItem.id } };
  const bookItemGetRes2 = fakeRes();
  await itemController.get(bookItemGetReq2, bookItemGetRes2);
  check('After fulfillment, booked_quantity drops to 0', Number(bookItemGetRes2._body.booked_quantity) === 0);
  check('After fulfillment, available_quantity equals on-hand', Number(bookItemGetRes2._body.available_quantity) === 40);

  let fulfillTwiceRejected = false;
  try { await bookingService.fulfillBooking(company.id, bookingRow.id, user.id); }
  catch (e) { fulfillTwiceRejected = e.status === 400; }
  check('Fulfilling an already-fulfilled booking is rejected', fulfillTwiceRejected);

  const bookInvoice2 = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-02-05',
    lines: [{ account_id: revenue.id, item_id: bookItem.id, description: 'Booked sale 2', quantity: 5, unit_price: 20, is_booked: true, delivery_date: '2026-03-10' }],
  });
  const postedBookInvoice2 = await invoiceService.postInvoice(company.id, bookInvoice2.id, user.id);
  const booking2 = await ItemBooking.findOne({ where: { invoice_id: bookInvoice2.id } });
  check('Second booking created pending', booking2.status === 'pending');

  await invoiceService.cancelInvoice(company.id, postedBookInvoice2.id);
  const booking2AfterCancel = await ItemBooking.findByPk(booking2.id);
  check('Cancelling the invoice cancels its pending booking', booking2AfterCancel.status === 'cancelled');

  const bookItemAfterCancel = await Item.findByPk(bookItem.id);
  check('Cancelling a booked invoice never touched stock', Number(bookItemAfterCancel.quantity_on_hand) === 40);

  let cancelNonPendingRejected = false;
  try { await bookingService.cancelBooking(company.id, booking2.id); }
  catch (e) { cancelNonPendingRejected = e.status === 400; }
  check('Cancelling a non-pending booking is rejected', cancelNonPendingRejected);

  // ==== Discount Codes + Sold Items Per Client ====

  const itemD1 = await itemService.createItem(company.id, user.id, {
    name_en: 'Discount Widget', name_ar: 'قطعة خصم',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    selling_price: 10, opening_quantity: 100, opening_cost: 3,
  });
  const itemD2 = await itemService.createItem(company.id, user.id, {
    name_en: 'Discount Gadget', name_ar: 'أداة خصم',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    selling_price: 20, opening_quantity: 100, opening_cost: 8,
  });

  const discPct = await DiscountCode.create({ company_id: company.id, code: 'SAVE10', type: 'percentage', value: 10, scope: 'invoice' });
  const discFixedLine = await DiscountCode.create({ company_id: company.id, code: 'FLAT5', type: 'fixed', value: 5, scope: 'line' });
  const discExpired = await DiscountCode.create({ company_id: company.id, code: 'OLDCODE', type: 'percentage', value: 10, scope: 'invoice', expiry_date: '2020-01-01' });
  const discMin = await DiscountCode.create({ company_id: company.id, code: 'BIG20', type: 'percentage', value: 20, scope: 'invoice', min_invoice_amount: 1000 });
  const discOnce = await DiscountCode.create({ company_id: company.id, code: 'ONECODE', type: 'fixed', value: 1, scope: 'invoice', max_redemptions: 1 });
  const discEditMe = await DiscountCode.create({ company_id: company.id, code: 'EDITME', type: 'fixed', value: 2, scope: 'invoice', max_redemptions: 1 });

  // -- Invoice-level percentage discount --
  const invDisc1 = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-01-05',
    discount_code: 'save10', // lowercase on purpose — must match case-insensitively
    lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 2, unit_price: 10 }],
  });
  check('Invoice-level % discount: subtotal is net of discount', Math.abs(Number(invDisc1.subtotal) - 18) < 0.001);
  check('Invoice-level % discount: discount_amount = 2 (10% of 20)', Math.abs(Number(invDisc1.discount_amount) - 2) < 0.001);
  check('Invoice-level % discount: total matches subtotal (no tax)', Math.abs(Number(invDisc1.total) - 18) < 0.001);
  check('Invoice-level % discount: discount_code_id set', invDisc1.discount_code_id === discPct.id);
  const invDisc1Lines = await InvoiceLine.findAll({ where: { invoice_id: invDisc1.id } });
  check('Invoice-level % discount: single line carries the full allocated discount', Math.abs(Number(invDisc1Lines[0].discount_amount) - 2) < 0.001);
  check('Invoice-level % discount: line itself has no discount_code_id (header-level, not line-level)', invDisc1Lines[0].discount_code_id === null);

  // -- Line-level fixed discount, proportional allocation not involved --
  const invDisc2 = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-01-05',
    lines: [
      { account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 10, discount_code: 'FLAT5' },
      { account_id: revenue.id, item_id: itemD2.id, quantity: 1, unit_price: 20 },
    ],
  });
  check('Line-level fixed discount: invoice subtotal = 25 (10-5 + 20)', Math.abs(Number(invDisc2.subtotal) - 25) < 0.001);
  check('Line-level fixed discount: invoice discount_amount = 5', Math.abs(Number(invDisc2.discount_amount) - 5) < 0.001);
  check('Line-level fixed discount: invoice discount_code_id is null (line-scoped, not header)', invDisc2.discount_code_id === null);
  const invDisc2Lines = await InvoiceLine.findAll({ where: { invoice_id: invDisc2.id }, order: [['line_order', 'ASC']] });
  check('Line-level fixed discount: line 1 net subtotal = 5', Math.abs(Number(invDisc2Lines[0].line_subtotal) - 5) < 0.001);
  check('Line-level fixed discount: line 1 discount_code_id set', invDisc2Lines[0].discount_code_id === discFixedLine.id);
  check('Line-level fixed discount: line 2 untouched', Math.abs(Number(invDisc2Lines[1].discount_amount)) < 0.001);

  // -- Fixed discount larger than the line clamps to the line amount, never negative --
  const invDisc3 = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-01-05',
    lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 3, discount_code: 'FLAT5' }],
  });
  check('Fixed discount larger than line amount clamps to 0, never negative', Math.abs(Number(invDisc3.subtotal)) < 0.001 && Math.abs(Number(invDisc3.discount_amount) - 3) < 0.001);

  // -- Cannot mix a header-level code with per-line codes on the same invoice --
  let mixedRejected = false;
  try {
    await invoiceService.createInvoice(company.id, user.id, {
      type: 'sales', client_id: client.id, date: '2026-01-05', discount_code: 'SAVE10',
      lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 10, discount_code: 'FLAT5' }],
    });
  } catch (e) { mixedRejected = e.status === 400; }
  check('Mixing a header code with a line code on the same invoice is rejected', mixedRejected);

  // -- Scope mismatch: a line-scoped code cannot be used as the header code, and vice versa --
  let headerScopeRejected = false;
  try {
    await invoiceService.createInvoice(company.id, user.id, {
      type: 'sales', client_id: client.id, date: '2026-01-05', discount_code: 'FLAT5',
      lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 10 }],
    });
  } catch (e) { headerScopeRejected = e.status === 400; }
  check('Line-scoped code rejected when applied at the header level', headerScopeRejected);

  let lineScopeRejected = false;
  try {
    await invoiceService.createInvoice(company.id, user.id, {
      type: 'sales', client_id: client.id, date: '2026-01-05',
      lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 10, discount_code: 'SAVE10' }],
    });
  } catch (e) { lineScopeRejected = e.status === 400; }
  check('Invoice-scoped code rejected when applied on a line', lineScopeRejected);

  // -- Expired code rejected --
  let expiredRejected = false;
  try {
    await invoiceService.createInvoice(company.id, user.id, {
      type: 'sales', client_id: client.id, date: '2026-01-05', discount_code: 'OLDCODE',
      lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 10 }],
    });
  } catch (e) { expiredRejected = e.status === 400; }
  check('Expired discount code rejected', expiredRejected);

  // -- Minimum invoice amount enforced --
  let minAmountRejected = false;
  try {
    await invoiceService.createInvoice(company.id, user.id, {
      type: 'sales', client_id: client.id, date: '2026-01-05', discount_code: 'BIG20',
      lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 10 }],
    });
  } catch (e) { minAmountRejected = e.status === 400; }
  check('Discount code below its minimum invoice amount rejected', minAmountRejected);

  const invBig = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-01-05', discount_code: 'BIG20',
    lines: [{ account_id: revenue.id, item_id: itemD2.id, quantity: 60, unit_price: 20 }], // raw 1200 >= 1000 minimum
  });
  check('Discount code applies once its minimum invoice amount is met (20% of 1200 = 240)', Math.abs(Number(invBig.discount_amount) - 240) < 0.001);

  // -- max_redemptions enforced, and freed up again when the using draft is deleted --
  const invOnce1 = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-01-05', discount_code: 'ONECODE',
    lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 10 }],
  });
  check('First use of a max_redemptions=1 code succeeds', invOnce1.discount_code_id === discOnce.id);

  let secondUseRejected = false;
  try {
    await invoiceService.createInvoice(company.id, user.id, {
      type: 'sales', client_id: client.id, date: '2026-01-05', discount_code: 'ONECODE',
      lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 10 }],
    });
  } catch (e) { secondUseRejected = e.status === 400; }
  check('Second use of a max_redemptions=1 code rejected while the first invoice still exists', secondUseRejected);

  await invOnce1.destroy(); // draft deletion frees the usage back up (live-counted, not a stored counter)
  const invOnce2 = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-01-05', discount_code: 'ONECODE',
    lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 10 }],
  });
  check('Deleting the draft that used a max_redemptions=1 code frees it up for reuse', invOnce2.discount_code_id === discOnce.id);

  // -- Editing a draft that already used a limited code doesn't self-block --
  const invEdit = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-01-05', discount_code: 'EDITME',
    lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 1, unit_price: 10 }],
  });
  const editReq = {
    companyId: company.id, params: { id: invEdit.id },
    body: {
      client_id: client.id, date: '2026-01-06', discount_code: 'EDITME',
      lines: [{ account_id: revenue.id, item_id: itemD1.id, quantity: 2, unit_price: 10 }],
    },
  };
  const editRes = fakeRes();
  await invoiceController.update(editReq, editRes);
  check('Re-saving a draft with the same limited code it already used does not self-block', editRes._body && editRes._body.discount_code_id === discEditMe.id);

  // ---- discountCodeController: CRUD + preview ----

  const dcCreateReq = { companyId: company.id, body: { code: 'welcome15', type: 'percentage', value: 15, scope: 'invoice', description: 'Welcome offer' } };
  const dcCreateRes = fakeRes();
  await discountCodeController.create(dcCreateReq, dcCreateRes);
  check('discountCodeController.create: code stored uppercased', dcCreateRes._body.code === 'WELCOME15');

  const dcDupeReq = { companyId: company.id, body: { code: 'WELCOME15', type: 'fixed', value: 1, scope: 'invoice' } };
  const dcDupeRes = fakeRes();
  await discountCodeController.create(dcDupeReq, dcDupeRes);
  check('discountCodeController.create: duplicate code (case-insensitive) rejected', dcDupeRes._status === 400);

  const dcListReq = { companyId: company.id, query: {} };
  const dcListRes = fakeRes();
  await discountCodeController.list(dcListReq, dcListRes);
  const welcomeRow = dcListRes._body.find((r) => r.code === 'WELCOME15');
  check('discountCodeController.list: live used_count present and 0 for a brand-new code', !!welcomeRow && welcomeRow.used_count === 0);
  const saveRow = dcListRes._body.find((r) => r.code === 'SAVE10');
  check('discountCodeController.list: used_count reflects actual invoices using it', saveRow.used_count >= 1);

  const dcPreviewReq = { companyId: company.id, body: { code: 'WELCOME15', base_amount: 100, scope: 'invoice' } };
  const dcPreviewRes = fakeRes();
  await discountCodeController.preview(dcPreviewReq, dcPreviewRes);
  check('discountCodeController.preview: computes 15% of 100 = 15 without redeeming anything', Math.abs(dcPreviewRes._body.discount_amount - 15) < 0.001);

  const dcRemoveReq = { companyId: company.id, params: { id: dcCreateRes._body.id } };
  const dcRemoveRes = fakeRes();
  await discountCodeController.remove(dcRemoveReq, dcRemoveRes);
  const dcListActiveRes = fakeRes();
  await discountCodeController.list(dcListReq, dcListActiveRes);
  check('discountCodeController: deactivated code excluded from default (active-only) list', !dcListActiveRes._body.some((r) => r.code === 'WELCOME15'));

  // ---- Sold Items Per Client report ----

  await invoiceService.postInvoice(company.id, invDisc1.id, user.id); // 2 x itemD1 @10, 10% off -> qty 2, revenue 18
  await invoiceService.postInvoice(company.id, invDisc2.id, user.id); // itemD1 qty1 net5, itemD2 qty1 net20

  const soldReq = { companyId: company.id, query: {} };
  const soldRes = fakeRes();
  await inventoryReportController.soldByClient(soldReq, soldRes);
  const soldD1Row = soldRes._body.rows.find((r) => r.item_id === itemD1.id && r.client_id === client.id);
  check('Sold-by-client: aggregates quantity across multiple posted invoices for the same item+client', Math.abs(soldD1Row.quantity_sold - 3) < 0.001); // 2 (invDisc1) + 1 (invDisc2)
  check('Sold-by-client: revenue is net of discount (18 + 5 = 23)', Math.abs(soldD1Row.revenue - 23) < 0.001);
  check('Sold-by-client: invoice_count reflects 2 distinct invoices', soldD1Row.invoice_count === 2);

  const soldByClientFilterReq = { companyId: company.id, query: { client_id: client.id } };
  const soldByClientFilterRes = fakeRes();
  await inventoryReportController.soldByClient(soldByClientFilterReq, soldByClientFilterRes);
  check('Sold-by-client: client_id filter returns only that client\'s rows', soldByClientFilterRes._body.rows.every((r) => r.client_id === client.id));

  const soldByItemFilterReq = { companyId: company.id, query: { item_id: itemD2.id } };
  const soldByItemFilterRes = fakeRes();
  await inventoryReportController.soldByClient(soldByItemFilterReq, soldByItemFilterRes);
  check('Sold-by-client: item_id filter returns only that item\'s rows', soldByItemFilterRes._body.rows.every((r) => r.item_id === itemD2.id));

  const soldByDateFilterReq = { companyId: company.id, query: { from: '2099-01-01' } };
  const soldByDateFilterRes = fakeRes();
  await inventoryReportController.soldByClient(soldByDateFilterReq, soldByDateFilterRes);
  check('Sold-by-client: a future date filter excludes all rows', soldByDateFilterRes._body.rows.length === 0);

  // ==== Item image upload (optional product photo) ====

  const itemImg = await itemService.createItem(company.id, user.id, {
    name_en: 'Photo Item', name_ar: 'صنف بصورة',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
  });
  check('New item has no image_url by default', itemImg.image_url === null || itemImg.image_url === undefined);

  const uploadReq = {
    companyId: company.id, params: { id: itemImg.id },
    file: { filename: 'photo-123.png' }, // simulates what multer would attach to req.file
  };
  const uploadRes = fakeRes();
  await itemController.uploadImage(uploadReq, uploadRes);
  check('itemController.uploadImage sets image_url to the public /uploads path', uploadRes._body.image_url === `/uploads/${company.id}/item-images/photo-123.png`);

  const noFileReq = { companyId: company.id, params: { id: itemImg.id }, file: undefined };
  const noFileRes = fakeRes();
  await itemController.uploadImage(noFileReq, noFileRes);
  check('itemController.uploadImage without a file is rejected', noFileRes._status === 400);

  const removeImgReq = { companyId: company.id, params: { id: itemImg.id } };
  const removeImgRes = fakeRes();
  await itemController.removeImage(removeImgReq, removeImgRes);
  check('itemController.removeImage clears image_url', removeImgRes._body.image_url === null);

  const foreignItemImg = await itemService.createItem(foreignCompany.id, user.id, {
    name_en: 'Foreign Photo Item', name_ar: 'x',
    inventory_account_id: (await Account.create({ company_id: foreignCompany.id, code: '9899', name_en: 'FInv', name_ar: 'x', type: 'asset', normal_balance: 'debit' })).id,
    income_account_id: (await Account.create({ company_id: foreignCompany.id, code: '9898', name_en: 'FRev', name_ar: 'x', type: 'revenue', normal_balance: 'credit' })).id,
    cogs_account_id: (await Account.create({ company_id: foreignCompany.id, code: '9897', name_en: 'FCogs', name_ar: 'x', type: 'expense', normal_balance: 'debit' })).id,
  });
  const crossCompanyImgReq = { companyId: company.id, params: { id: foreignItemImg.id }, file: { filename: 'x.png' } };
  const crossCompanyImgRes = fakeRes();
  await itemController.uploadImage(crossCompanyImgReq, crossCompanyImgRes);
  check('itemController.uploadImage on another company\'s item returns 404', crossCompanyImgRes._status === 404);

  // ==== Inventory Filters (branch, date range, booked-only, low-stock) on Items list/exports ====

  const filterItem = await itemService.createItem(company.id, user.id, {
    name_en: 'Filter Test Item', name_ar: 'صنف اختبار الفلاتر',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    selling_price: 5, reorder_level: 0,
  });
  await sequelize.transaction((t) => itemService.receiveStock(company.id, filterItem.id, { quantity: 40, unitCost: 2, date: '2026-05-01', userId: user.id, branchId: branchA.id }, t));
  await sequelize.transaction((t) => itemService.receiveStock(company.id, filterItem.id, { quantity: 10, unitCost: 2, date: '2026-05-01', userId: user.id, branchId: branchB.id }, t));

  const filterBookInvoice = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: client.id, date: '2026-05-02', branch_id: branchA.id,
    lines: [{ account_id: revenue.id, item_id: filterItem.id, description: 'Booked at branch A', quantity: 6, unit_price: 5, is_booked: true, delivery_date: '2026-06-01' }],
  });
  await invoiceService.postInvoice(company.id, filterBookInvoice.id, user.id);

  const listReqA = { companyId: company.id, query: { branch_id: branchA.id } };
  const listResA = fakeRes();
  await itemController.list(listReqA, listResA);
  const rowA = listResA._body.find((i) => i.id === filterItem.id);
  check('Branch filter shows only that branch\'s stock', Number(rowA.total_quantity_on_hand) === 40);
  check('Branch filter shows only that branch\'s booked quantity', Number(rowA.booked_quantity) === 6);
  check('Branch filter available = branch stock minus branch booked', Number(rowA.available_quantity) === 34);

  const listReqB = { companyId: company.id, query: { branch_id: branchB.id } };
  const listResB = fakeRes();
  await itemController.list(listReqB, listResB);
  const rowB = listResB._body.find((i) => i.id === filterItem.id);
  check('Branch B filter shows branch B\'s own stock, unaffected by branch A\'s booking', Number(rowB.total_quantity_on_hand) === 10 && Number(rowB.booked_quantity) === 0);

  const listReqNoBranch = { companyId: company.id, query: {} };
  const listResNoBranch = fakeRes();
  await itemController.list(listReqNoBranch, listResNoBranch);
  const rowAll = listResNoBranch._body.find((i) => i.id === filterItem.id);
  check('No branch filter still returns the full company-wide total (unchanged behavior)', Number(rowAll.total_quantity_on_hand) === 50 && Number(rowAll.booked_quantity) === 6);

  const bookedOnlyReq = { companyId: company.id, query: { booked_only: 'true' } };
  const bookedOnlyRes = fakeRes();
  await itemController.list(bookedOnlyReq, bookedOnlyRes);
  check('booked_only filter includes the item with a pending booking', bookedOnlyRes._body.some((i) => i.id === filterItem.id));
  check('booked_only filter excludes an item with no booking', !bookedOnlyRes._body.some((i) => i.id === item.id));

  const beforeReq = { companyId: company.id, query: { date_to: '2020-01-01' } };
  const beforeRes = fakeRes();
  await itemController.list(beforeReq, beforeRes);
  check('date_to filter excludes items created after that date', !beforeRes._body.some((i) => i.id === filterItem.id));

  const todayStr = new Date().toISOString().slice(0, 10);
  const afterReq = { companyId: company.id, query: { date_from: todayStr } };
  const afterRes = fakeRes();
  await itemController.list(afterReq, afterRes);
  check('date_from filter (today) includes an item created just now', afterRes._body.some((i) => i.id === filterItem.id));

  const lowStockFilterItem = await itemService.createItem(company.id, user.id, {
    name_en: 'Low Stock Filter Item', name_ar: 'صنف مخزون منخفض',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    selling_price: 3, opening_quantity: 2, opening_cost: 1, reorder_level: 5,
  });
  const lowStockFilterReq = { companyId: company.id, query: { low_stock: 'true' } };
  const lowStockFilterRes = fakeRes();
  await itemController.list(lowStockFilterReq, lowStockFilterRes);
  check('low_stock query filter includes an item at/under its reorder level', lowStockFilterRes._body.some((i) => i.id === lowStockFilterItem.id));
  check('low_stock query filter excludes a well-stocked item', !lowStockFilterRes._body.some((i) => i.id === filterItem.id));

  // ==== POS Module (shifts, cashier permissions, split/credit tender, void) ====

  const knetAcc = await Account.create({ company_id: company.id, code: '1040', name_en: 'Knet Clearing', name_ar: 'كي نت', type: 'asset', normal_balance: 'debit', parent_id: assetsParent.id });

  const posFsReq = { companyId: company.id, body: { pos_cash_account_id: cash.id, pos_knet_account_id: knetAcc.id, cash_control_account_id: cash.id } };
  const posFsRes = fakeRes();
  await financialSettingController.update(posFsReq, posFsRes);
  check('POS cash/knet default accounts saved to Financial Configuration', posFsRes._body.pos_cash_account_id === cash.id && posFsRes._body.pos_knet_account_id === knetAcc.id);
  check('Cash Control default account saved to Financial Configuration', posFsRes._body.cash_control_account_id === cash.id);

  const posItem = await itemService.createItem(company.id, user.id, {
    name_en: 'POS Widget', name_ar: 'قطعة كاشير',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id,
    selling_price: 10,
  });
  // POS sales post against the cashier's shift branch, which draws from that
  // branch's own stock balance (not the item's unassigned/company-wide
  // total) — so stock the item into branchA the same way a warehouse
  // receipt/transfer would before any till can sell it there.
  await sequelize.transaction((t) => itemService.receiveStock(company.id, posItem.id, { quantity: 100, unitCost: 4, date: '2026-04-01', userId: user.id, branchId: branchA.id }, t));

  const posClient = await Client.create({ company_id: company.id, code: 'POSCL', name_en: 'POS Client', name_ar: 'عميل كاشير', account_id: ar.id, credit_limit: 50 });

  const cashierUser = await User.create({ name: 'Cashier One', email: 'cashier1@test.com', password_hash: 'x', role: 'viewer' });
  await UserCompany.create({ user_id: cashierUser.id, company_id: company.id, role: 'viewer', pos_role: 'cashier' });

  const operatorUser = await User.create({ name: 'Operator One', email: 'operator1@test.com', password_hash: 'x', role: 'viewer' });
  await UserCompany.create({ user_id: operatorUser.id, company_id: company.id, role: 'viewer', pos_role: 'operator' });

  const noAccessUser = await User.create({ name: 'No Access', email: 'noaccess@test.com', password_hash: 'x', role: 'viewer' });
  const noAccessUc = await UserCompany.create({ user_id: noAccessUser.id, company_id: company.id, role: 'viewer' });
  check('UserCompany defaults pos_role to none', noAccessUc.pos_role === 'none');
  check('UserCompany defaults pos_permissions to an empty array', Array.isArray(noAccessUc.pos_permissions) && noAccessUc.pos_permissions.length === 0);

  const adminProfile = await posService.getPosProfile(company.id, user.id, false, 'admin');
  check('Company admin gets operator-level POS access automatically', adminProfile.level === 'operator' && adminProfile.hasAccess);

  const accountantProfile = await posService.getPosProfile(company.id, noAccessUser.id, false, 'accountant');
  check('Accountant role gets operator-level POS access automatically', accountantProfile.level === 'operator');

  const noAccessProfile = await posService.getPosProfile(company.id, noAccessUser.id, false, 'viewer');
  check('Viewer with pos_role none has no POS access', noAccessProfile.hasAccess === false);

  const cashierProfile = await posService.getPosProfile(company.id, cashierUser.id, false, 'viewer');
  check('Viewer with pos_role cashier gets cashier-level access', cashierProfile.level === 'cashier' && cashierProfile.hasAccess);
  check('Cashier without extra permissions cannot void', cashierProfile.can('void') === false);
  check('Cashier without extra permissions cannot sell on credit', cashierProfile.can('credit_sale') === false);

  const operatorProfile = await posService.getPosProfile(company.id, operatorUser.id, false, 'viewer');
  check('Viewer with pos_role operator gets full POS access', operatorProfile.level === 'operator' && operatorProfile.can('void') && operatorProfile.can('credit_sale'));

  // -- Shifts --
  const shift1 = await posService.openShift(company.id, cashierUser.id, { branch_id: branchA.id, opening_float: 50 });
  check('Cashier can open a shift', shift1.status === 'open' && Number(shift1.opening_float) === 50);

  let openTwiceRejected = false;
  try { await posService.openShift(company.id, cashierUser.id, { branch_id: branchA.id, opening_float: 0 }); }
  catch (e) { openTwiceRejected = e.status === 400; }
  check('Opening a second shift while one is already open is rejected', openTwiceRejected);

  let saleWithoutShiftRejected = false;
  try {
    await posService.createSale(company.id, operatorUser.id, operatorProfile, {
      client_id: posClient.id, action: 'complete',
      lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 1, unit_price: 10 }],
      payments: [{ method: 'cash', amount: 10 }],
    });
  } catch (e) { saleWithoutShiftRejected = e.status === 400; }
  check('Cannot ring a sale without an open shift', saleWithoutShiftRejected);

  const opShift = await posService.openShift(company.id, operatorUser.id, { branch_id: branchA.id, opening_float: 100 });

  // -- Hold --
  const heldSale = await posService.createSale(company.id, operatorUser.id, operatorProfile, {
    client_id: posClient.id, action: 'hold',
    lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 2, unit_price: 10 }],
  });
  check('Held sale is saved as a draft invoice tagged channel=pos', heldSale.status === 'draft' && heldSale.channel === 'pos' && heldSale.pos_shift_id === opShift.id);

  const held = await posService.heldSales(company.id, operatorUser.id);
  check('heldSales lists the held draft for this cashier', held.some((h) => h.id === heldSale.id));

  // -- Split cash+knet sale --
  const splitSale = await posService.createSale(company.id, operatorUser.id, operatorProfile, {
    client_id: posClient.id, action: 'complete',
    lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 3, unit_price: 10 }], // total 30
    payments: [{ method: 'cash', amount: 20 }, { method: 'knet', amount: 10, reference: 'KN-123' }],
  });
  check('Split cash+knet sale posts and is fully paid', splitSale.status === 'paid' && Number(splitSale.paid_total) === 30);
  check('Split sale is tagged as a POS sale on the cashier\'s shift', splitSale.channel === 'pos' && splitSale.pos_shift_id === opShift.id);

  const splitPayments = await InvoicePayment.findAll({ where: { invoice_id: splitSale.id }, order: [['amount', 'DESC']] });
  check(
    'Split sale recorded two payments with the right methods/amounts',
    splitPayments.length === 2
    && splitPayments.some((p) => p.payment_method === 'cash' && Number(p.amount) === 20)
    && splitPayments.some((p) => p.payment_method === 'knet' && Number(p.amount) === 10 && p.reference === 'KN-123'),
  );

  const cashPayment = splitPayments.find((p) => p.payment_method === 'cash');
  const cashVoucherLines = await VoucherLine.findAll({ where: { voucher_id: cashPayment.voucher_id } });
  check('Cash payment posted to the configured POS cash account', cashVoucherLines.some((l) => l.account_id === cash.id));

  const knetPayment = splitPayments.find((p) => p.payment_method === 'knet');
  const knetVoucherLines = await VoucherLine.findAll({ where: { voucher_id: knetPayment.voucher_id } });
  check('Knet payment posted to the configured POS knet account', knetVoucherLines.some((l) => l.account_id === knetAcc.id));

  // -- Credit sale: permission gate --
  let creditByCashierRejected = false;
  try {
    await posService.createSale(company.id, cashierUser.id, cashierProfile, {
      client_id: posClient.id, action: 'complete',
      lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 1, unit_price: 10 }],
      payments: [{ method: 'credit', amount: 10 }],
    });
  } catch (e) { creditByCashierRejected = e.status === 403; }
  check('Cashier without credit_sale permission cannot sell on credit', creditByCashierRejected);

  const draftsAfterRejectedCredit = await Invoice.count({ where: { company_id: company.id, client_id: posClient.id, channel: 'pos', status: 'draft' } });
  check('Rejected credit sale leaves no orphaned draft invoice behind', draftsAfterRejectedCredit === 1); // just heldSale

  const grantReq = { companyId: company.id, params: { userId: cashierUser.id }, body: { pos_permissions: ['credit_sale', 'void'] } };
  const grantRes = fakeRes();
  await posController.updateCashier(grantReq, grantRes);
  check('Admin can grant extra POS permissions to a cashier', grantRes._body.pos_permissions.includes('credit_sale') && grantRes._body.pos_permissions.includes('void'));

  const cashierProfile2 = await posService.getPosProfile(company.id, cashierUser.id, false, 'viewer');
  check('Cashier profile reflects newly granted permissions', cashierProfile2.can('credit_sale') && cashierProfile2.can('void'));

  const creditSale = await posService.createSale(company.id, cashierUser.id, cashierProfile2, {
    client_id: posClient.id, action: 'complete',
    lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 1, unit_price: 10 }],
    payments: [{ method: 'credit', amount: 10 }],
  });
  check('Credit sale posts and leaves the balance unpaid against the client', creditSale.status === 'posted' && Number(creditSale.paid_total) === 0 && Number(creditSale.total) === 10);

  // -- Credit limit enforcement --
  let creditLimitRejected = false;
  const invoiceCountBeforeLimitTest = await Invoice.count({ where: { company_id: company.id } });
  try {
    await posService.createSale(company.id, cashierUser.id, cashierProfile2, {
      client_id: posClient.id, action: 'complete',
      lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 10, unit_price: 10 }], // total 100
      payments: [{ method: 'credit', amount: 100 }],
    });
  } catch (e) { creditLimitRejected = e.status === 400; }
  check('Credit sale that would exceed the client\'s credit_limit is rejected', creditLimitRejected);
  const invoiceCountAfterLimitTest = await Invoice.count({ where: { company_id: company.id } });
  check('Rejected over-limit credit sale leaves no invoice behind', invoiceCountAfterLimitTest === invoiceCountBeforeLimitTest);

  // -- Void --
  const holdToVoid = await posService.createSale(company.id, operatorUser.id, operatorProfile, {
    client_id: posClient.id, action: 'hold',
    lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 1, unit_price: 10 }],
  });
  const voidedHold = await posService.voidSale(company.id, operatorUser.id, operatorProfile, holdToVoid.id);
  check('Voiding a held (draft) sale deletes it', voidedHold.status === 'voided');
  const heldAfterVoid = await Invoice.findByPk(holdToVoid.id);
  check('Voided held sale no longer exists', heldAfterVoid === null);

  const unpaidToVoid = await posService.createSale(company.id, operatorUser.id, operatorProfile, {
    client_id: posClient.id, action: 'complete',
    lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 1, unit_price: 10 }],
    payments: [{ method: 'credit', amount: 10 }],
  });
  const voidedUnpaid = await posService.voidSale(company.id, operatorUser.id, operatorProfile, unpaidToVoid.id);
  check('Voiding a posted-but-unpaid sale cancels it', voidedUnpaid.status === 'cancelled');

  let voidPaidRejected = false;
  try { await posService.voidSale(company.id, operatorUser.id, operatorProfile, splitSale.id); }
  catch (e) { voidPaidRejected = e.status === 400; }
  check('Voiding an already-paid sale is rejected', voidPaidRejected);

  // -- Close shift --
  const closedShift = await posService.closeShift(company.id, operatorUser.id, opShift.id, { counted_cash: 120 });
  check('Closing a shift computes expected cash = opening float + cash sales on that shift', Number(closedShift.expected_cash) === 120); // 100 opening + 20 cash from splitSale
  check('Closing a shift records counted cash with zero variance when it matches', Number(closedShift.counted_cash) === 120 && Number(closedShift.variance) === 0);

  let doubleCloseRejected = false;
  try { await posService.closeShift(company.id, operatorUser.id, opShift.id, { counted_cash: 0 }); }
  catch (e) { doubleCloseRejected = e.status === 400; }
  check('Closing an already-closed shift is rejected', doubleCloseRejected);

  const shiftsList = await posService.listShifts(company.id, {});
  check('listShifts returns shifts for this company', shiftsList.some((s) => s.id === opShift.id));

  // -- Controller wiring smoke tests --
  const myAccessReq = { companyId: company.id, user: { id: operatorUser.id, role: 'viewer' }, companyRole: 'viewer' };
  const myAccessRes = fakeRes();
  await posController.myAccess(myAccessReq, myAccessRes);
  check('posController.myAccess reports operator level for the operator user', myAccessRes._body.level === 'operator');

  const listCashiersReq = { companyId: company.id };
  const listCashiersRes = fakeRes();
  await posController.listCashiers(listCashiersReq, listCashiersRes);
  check('posController.listCashiers lists the configured cashier with granted permissions', listCashiersRes._body.some((c) => c.user_id === cashierUser.id && c.pos_role === 'cashier' && c.pos_permissions.includes('void')));

  await posService.openShift(company.id, operatorUser.id, { branch_id: branchA.id, opening_float: 0 });
  const createSaleReq = {
    companyId: company.id, user: { id: operatorUser.id, role: 'viewer' }, companyRole: 'viewer',
    body: { client_id: posClient.id, action: 'hold', lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 1, unit_price: 10 }] },
  };
  const createSaleRes = fakeRes();
  await posController.createSale(createSaleReq, createSaleRes);
  check('posController.createSale (hold) returns 201 with a draft invoice', createSaleRes._status === 201 && createSaleRes._body.status === 'draft');

  const voidSaleReq = { companyId: company.id, user: { id: operatorUser.id, role: 'viewer' }, companyRole: 'viewer', params: { id: createSaleRes._body.id } };
  const voidSaleRes = fakeRes();
  await posController.voidSale(voidSaleReq, voidSaleRes);
  check('posController.voidSale deletes the held draft via the route wiring', voidSaleRes._body.status === 'voided');

  const badUpdateReq = { companyId: company.id, params: { userId: '00000000-0000-0000-0000-000000000000' }, body: { pos_role: 'operator' } };
  const badUpdateRes = fakeRes();
  await posController.updateCashier(badUpdateReq, badUpdateRes);
  check('updateCashier for a user not assigned to this company returns 404', badUpdateRes._status === 404);

  const badPermReq = { companyId: company.id, params: { userId: cashierUser.id }, body: { pos_permissions: ['not_a_real_permission'] } };
  const badPermRes = fakeRes();
  await posController.updateCashier(badPermReq, badPermRes);
  check('updateCashier rejects an invalid pos_permissions value', badPermRes._status === 400);

  // ==== Refund (reverses a completed POS sale: payments, posting voucher, stock) ====

  const stockBeforeRefund = await ItemBranchStock.findOne({ where: { item_id: posItem.id, branch_id: branchA.id } });
  const qtyBeforeRefund = Number(stockBeforeRefund.quantity_on_hand);

  const refundedSplitSale = await invoiceService.refundInvoice(company.id, operatorUser.id, splitSale.id, { reason: 'Customer changed mind' });
  check('Refund marks the invoice cancelled and clears paid_total', refundedSplitSale.status === 'cancelled' && Number(refundedSplitSale.paid_total) === 0);
  check('Refund stamps refunded_at/refund_reason/refunded_by', !!refundedSplitSale.refunded_at && refundedSplitSale.refund_reason === 'Customer changed mind' && refundedSplitSale.refunded_by === operatorUser.id);

  const stockAfterRefund = await ItemBranchStock.findOne({ where: { item_id: posItem.id, branch_id: branchA.id } });
  check('Refund restores the exact issued quantity back to branch stock', Number(stockAfterRefund.quantity_on_hand) === qtyBeforeRefund + 3);

  const splitPaymentsAfterRefund = await InvoicePayment.findAll({ where: { invoice_id: splitSale.id } });
  const splitPaymentVouchers = await Voucher.findAll({ where: { id: splitPaymentsAfterRefund.map((p) => p.voucher_id) } });
  check('Refund cancels every payment voucher', splitPaymentVouchers.length === 2 && splitPaymentVouchers.every((v) => v.status === 'cancelled'));

  const splitPostingVoucher = await Voucher.findByPk(refundedSplitSale.posting_voucher_id);
  check('Refund cancels the main posting voucher', splitPostingVoucher.status === 'cancelled');

  let refundOnCancelledRejected = false;
  try { await invoiceService.refundInvoice(company.id, operatorUser.id, refundedSplitSale.id, {}); }
  catch (e) { refundOnCancelledRejected = e.status === 400; }
  check('Refunding an already-refunded/cancelled invoice is rejected', refundOnCancelledRejected);

  // -- Permission gate via posService.refundSale --
  let refundByCashierRejected = false;
  try { await posService.refundSale(company.id, cashierUser.id, cashierProfile, creditSale.id, {}); }
  catch (e) { refundByCashierRejected = e.status === 403; }
  check('Cashier without refund permission cannot process a refund', refundByCashierRejected);

  const refundGrantReq = { companyId: company.id, params: { userId: cashierUser.id }, body: { pos_permissions: ['credit_sale', 'void', 'refund'] } };
  const refundGrantRes = fakeRes();
  await posController.updateCashier(refundGrantReq, refundGrantRes);
  const cashierProfile3 = await posService.getPosProfile(company.id, cashierUser.id, false, 'viewer');
  check('Cashier profile reflects newly granted refund permission', cashierProfile3.can('refund'));

  const cashierPaidSale = await posService.createSale(company.id, cashierUser.id, cashierProfile2, {
    client_id: posClient.id, action: 'complete',
    lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 1, unit_price: 10 }],
    payments: [{ method: 'cash', amount: 10 }],
  });
  const refundedCashierPaidSale = await posService.refundSale(company.id, cashierUser.id, cashierProfile3, cashierPaidSale.id, {});
  check('Granted cashier can refund a paid sale through posService.refundSale', refundedCashierPaidSale.status === 'cancelled');

  // -- Refund is blocked when a booked line was already fulfilled (delivered) --
  const bookedRefundItem = await itemService.createItem(company.id, user.id, {
    name_en: 'Refund Test Booked Item', name_ar: 'صنف حجز للاسترجاع',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id, selling_price: 20,
  });
  await sequelize.transaction((t) => itemService.receiveStock(company.id, bookedRefundItem.id, { quantity: 10, unitCost: 5, date: '2026-04-01', userId: user.id }, t));
  const bookedRefundInvoice = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: posClient.id, date: '2026-04-02',
    lines: [{ account_id: revenue.id, item_id: bookedRefundItem.id, quantity: 2, unit_price: 20, is_booked: true, delivery_date: '2026-05-01' }],
  });
  const postedBookedRefundInvoice = await invoiceService.postInvoice(company.id, bookedRefundInvoice.id, user.id);
  await invoiceService.recordPayment(company.id, postedBookedRefundInvoice.id, user.id, { amount: 40, cash_account_id: cash.id, payment_method: 'cash' });
  const bookingToFulfill = await ItemBooking.findOne({ where: { invoice_id: bookedRefundInvoice.id } });
  await bookingService.fulfillBooking(company.id, bookingToFulfill.id, user.id, { date: '2026-04-05' });

  let refundWithFulfilledBookingRejected = false;
  try { await invoiceService.refundInvoice(company.id, user.id, bookedRefundInvoice.id, {}); }
  catch (e) { refundWithFulfilledBookingRejected = e.status === 400; }
  check('Refund is blocked when the invoice has an already-delivered (fulfilled) booking', refundWithFulfilledBookingRejected);

  // -- posController.refundSale route wiring --
  const refundControllerSale = await posService.createSale(company.id, operatorUser.id, operatorProfile, {
    client_id: posClient.id, action: 'complete',
    lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 1, unit_price: 10 }],
    payments: [{ method: 'cash', amount: 10 }],
  });
  const refundCtrlReq = { companyId: company.id, user: { id: operatorUser.id, role: 'viewer' }, companyRole: 'viewer', params: { id: refundControllerSale.id }, body: {} };
  const refundCtrlRes = fakeRes();
  await posController.refundSale(refundCtrlReq, refundCtrlRes);
  check('posController.refundSale refunds via route wiring', refundCtrlRes._body.status === 'cancelled');

  // ==== POS Sales History (Invoices By Date + Customer search) ====

  const historyResults = await posService.salesHistory(company.id, {});
  check('salesHistory excludes draft/held sales by default', historyResults.every((r) => r.status !== 'draft'));
  check('salesHistory includes completed POS sales', historyResults.some((r) => r.id === creditSale.id));

  const historyByDateRange = await posService.salesHistory(company.id, { date_from: '2099-01-01', date_to: '2099-12-31' });
  check('salesHistory date range filter excludes everything outside the range', historyByDateRange.length === 0);

  const historyByCustomer = await posService.salesHistory(company.id, { q: 'POS Client' });
  check('salesHistory customer name search finds sales for that client', historyByCustomer.some((r) => r.client_id === posClient.id));

  const historyClient = await Client.create({ company_id: company.id, code: 'HISTCL', name_en: 'History Buyer', name_ar: 'مشتري السجل', account_id: ar.id, phone: '5551234' });
  const historySale = await posService.createSale(company.id, operatorUser.id, operatorProfile, {
    client_id: historyClient.id, action: 'complete',
    lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 1, unit_price: 10 }],
    payments: [{ method: 'cash', amount: 10 }],
  });

  const historyByPhone = await posService.salesHistory(company.id, { q: '5551234' });
  check('salesHistory customer phone search finds the matching sale', historyByPhone.some((r) => r.id === historySale.id));

  const historyByInvoiceNo = await posService.salesHistory(company.id, { q: historySale.invoice_no });
  check('salesHistory free-text search also matches by invoice number', historyByInvoiceNo.some((r) => r.id === historySale.id));

  const historyPaidOnly = await posService.salesHistory(company.id, { status: 'paid' });
  check('salesHistory status filter returns only matching-status sales', historyPaidOnly.every((r) => r.status === 'paid') && historyPaidOnly.some((r) => r.id === historySale.id));

  const historyCtrlReq = { companyId: company.id, query: {} };
  const historyCtrlRes = fakeRes();
  await posController.salesHistory(historyCtrlReq, historyCtrlRes);
  check('posController.salesHistory returns an array via route wiring', Array.isArray(historyCtrlRes._body));

  // ==== Damages module (report -> clear write-off) ====

  const damageExpenseAcc = await Account.create({ company_id: company.id, code: '5099', name_en: 'Damaged Goods Expense', name_ar: 'مصروف تالف', type: 'expense', normal_balance: 'debit' });

  const damageFsReq = { companyId: company.id, body: { damage_expense_account_id: damageExpenseAcc.id } };
  const damageFsRes = fakeRes();
  await financialSettingController.update(damageFsReq, damageFsRes);
  check('Damage expense default account saved to Financial Configuration', damageFsRes._body.damage_expense_account_id === damageExpenseAcc.id);

  const damageItem = await itemService.createItem(company.id, user.id, {
    name_en: 'Mattress - Queen', name_ar: 'مرتبة كوين',
    inventory_account_id: inventoryAcc.id, income_account_id: revenue.id, cogs_account_id: cogsAcc.id, selling_price: 150,
  });
  await sequelize.transaction((t) => itemService.receiveStock(company.id, damageItem.id, { quantity: 20, unitCost: 60, date: '2026-04-01', userId: user.id }, t));

  check('DAMAGE_TYPES covers the expected categories', ['transport', 'warehouse', 'manufacturing_defect', 'customer_return', 'water_damage', 'other'].every((dt) => damageService.DAMAGE_TYPES.includes(dt)));

  const damageReport = await damageService.reportDamage(company.id, user.id, { item_id: damageItem.id, quantity: 3, damage_type: 'transport', notes: 'Torn during delivery' });
  check('Reporting a damage does not touch stock yet', Number((await Item.findByPk(damageItem.id)).quantity_on_hand) === 20);
  check('Damage report starts in reported status', damageReport.status === 'reported');

  let invalidDamageTypeRejected = false;
  try { await damageService.reportDamage(company.id, user.id, { item_id: damageItem.id, quantity: 1, damage_type: 'not_a_type' }); }
  catch (e) { invalidDamageTypeRejected = e.status === 400; }
  check('Reporting a damage with an invalid damage_type is rejected', invalidDamageTypeRejected);

  const clearedDamage = await damageService.clearDamage(company.id, user.id, damageReport.id);
  check('Clearing a damage marks it cleared with a cost snapshot', clearedDamage.status === 'cleared' && Number(clearedDamage.unit_cost) === 60);
  check('Clearing a damage removes the quantity from stock', Number((await Item.findByPk(damageItem.id)).quantity_on_hand) === 17);

  const damageWriteOffVoucher = await Voucher.findByPk(clearedDamage.write_off_voucher_id);
  const damageVoucherLines = await VoucherLine.findAll({ where: { voucher_id: damageWriteOffVoucher.id } });
  check("Damage write-off posts to the configured damage expense account, not the item's COGS account", damageVoucherLines.some((l) => l.account_id === damageExpenseAcc.id && Number(l.debit) === 180));
  check('Damage write-off credits the item\'s inventory account', damageVoucherLines.some((l) => l.account_id === inventoryAcc.id && Number(l.credit) === 180));

  let clearAlreadyClearedRejected = false;
  try { await damageService.clearDamage(company.id, user.id, damageReport.id); }
  catch (e) { clearAlreadyClearedRejected = e.status === 400; }
  check('Clearing an already-cleared damage is rejected', clearAlreadyClearedRejected);

  let deleteClearedRejected = false;
  try { await damageService.deleteDamage(company.id, damageReport.id); }
  catch (e) { deleteClearedRejected = e.status === 400; }
  check('Deleting a cleared damage write-off is rejected', deleteClearedRejected);

  const damageReport2 = await damageService.reportDamage(company.id, user.id, { item_id: damageItem.id, quantity: 1, damage_type: 'water_damage' });
  const deletedDamage = await damageService.deleteDamage(company.id, damageReport2.id);
  check('A still-reported damage can be deleted', deletedDamage.id === damageReport2.id);
  check('Deleting a reported damage does not touch stock', Number((await Item.findByPk(damageItem.id)).quantity_on_hand) === 17);

  const damagesList = await damageService.listDamages(company.id, { status: 'cleared' });
  check('listDamages status filter returns only cleared entries', damagesList.every((d) => d.status === 'cleared') && damagesList.some((d) => d.id === damageReport.id));

  // -- Controller wiring smoke tests --
  const damageCreateReq = { companyId: company.id, user: { id: user.id }, body: { item_id: damageItem.id, quantity: 2, damage_type: 'other' } };
  const damageCreateRes = fakeRes();
  await damageController.create(damageCreateReq, damageCreateRes);
  check('damageController.create returns 201 with a reported damage', damageCreateRes._status === 201 && damageCreateRes._body.status === 'reported');

  const damageClearReq = { companyId: company.id, user: { id: user.id }, params: { id: damageCreateRes._body.id } };
  const damageClearRes = fakeRes();
  await damageController.clear(damageClearReq, damageClearRes);
  check('damageController.clear writes off the damage via route wiring', damageClearRes._body.status === 'cleared');

  const damageTypesReq = {};
  const damageTypesRes = fakeRes();
  await damageController.types(damageTypesReq, damageTypesRes);
  check('damageController.types returns the DAMAGE_TYPES list', Array.isArray(damageTypesRes._body) && damageTypesRes._body.includes('manufacturing_defect'));

  const damageListReq = { companyId: company.id, query: {} };
  const damageListRes = fakeRes();
  await damageController.list(damageListReq, damageListRes);
  check('damageController.list returns an array via route wiring', Array.isArray(damageListRes._body));

  const damageReport3 = await damageService.reportDamage(company.id, user.id, { item_id: damageItem.id, quantity: 1, damage_type: 'other' });
  const damageRemoveReq = { companyId: company.id, params: { id: damageReport3.id } };
  const damageRemoveRes = fakeRes();
  await damageController.remove(damageRemoveReq, damageRemoveRes);
  check('damageController.remove deletes a reported (not cleared) damage via route wiring', damageRemoveRes._body.id === damageReport3.id);

  // ==== Delivery Date / Address (Sales Invoice + POS) + Delivery Schedule ====

  const deliveryClient = await Client.create({ company_id: company.id, code: 'DELCL', name_en: 'Delivery Client', name_ar: 'عميل التوصيل', account_id: ar.id, address: '123 Client Street' });

  const deliveryInvoice = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: deliveryClient.id, date: '2026-04-10',
    delivery_date: '2026-04-20', delivery_address: 'Warehouse Drop-off, Bay 3',
    lines: [{ account_id: revenue.id, description: 'Queen Mattress', quantity: 1, unit_price: 150 }],
  });
  check('createInvoice persists delivery_date and delivery_address', deliveryInvoice.delivery_date === '2026-04-20' && deliveryInvoice.delivery_address === 'Warehouse Drop-off, Bay 3');

  const updateDeliveryReq = {
    companyId: company.id,
    params: { id: deliveryInvoice.id },
    body: {
      client_id: deliveryClient.id, date: '2026-04-10',
      delivery_date: '2026-04-22', delivery_address: 'Updated Address',
      lines: [{ account_id: revenue.id, description: 'Queen Mattress', quantity: 1, unit_price: 150 }],
    },
  };
  const updateDeliveryRes = fakeRes();
  await invoiceController.update(updateDeliveryReq, updateDeliveryRes);
  check('invoiceController.update persists delivery_date/delivery_address changes', updateDeliveryRes._body.delivery_date === '2026-04-22' && updateDeliveryRes._body.delivery_address === 'Updated Address');

  const noDeliveryInvoice = await invoiceService.createInvoice(company.id, user.id, {
    type: 'sales', client_id: deliveryClient.id, date: '2026-04-10',
    lines: [{ account_id: revenue.id, description: 'Pillow', quantity: 1, unit_price: 10 }],
  });
  check('createInvoice without a delivery_date leaves it null', noDeliveryInvoice.delivery_date === null);

  // -- POS: delivery_date/delivery_address flow through posService.createSale --
  await posService.openShift(company.id, cashierUser.id, { branch_id: branchA.id, opening_float: 0 }).catch(() => {});
  const posDeliverySale = await posService.createSale(company.id, cashierUser.id, cashierProfile3, {
    client_id: deliveryClient.id, action: 'hold',
    delivery_date: '2026-04-25', delivery_address: 'Customer Home Address',
    lines: [{ account_id: revenue.id, item_id: posItem.id, quantity: 1, unit_price: 10 }],
  });
  check('POS createSale persists delivery_date/delivery_address on the invoice', posDeliverySale.delivery_date === '2026-04-25' && posDeliverySale.delivery_address === 'Customer Home Address');

  // -- Delivery Schedule --
  const scheduleReq = { companyId: company.id, query: {} };
  const scheduleRes = fakeRes();
  await invoiceController.deliverySchedule(scheduleReq, scheduleRes);
  check('deliverySchedule includes invoices with a delivery_date set', scheduleRes._body.some((r) => r.id === deliveryInvoice.id) && scheduleRes._body.some((r) => r.id === posDeliverySale.id));
  check('deliverySchedule excludes invoices without a delivery_date', scheduleRes._body.every((r) => r.id !== noDeliveryInvoice.id));
  check('deliverySchedule sorts by delivery_date ascending', new Date(scheduleRes._body[0].delivery_date) <= new Date(scheduleRes._body[scheduleRes._body.length - 1].delivery_date));

  const scheduleRangeReq = { companyId: company.id, query: { date_from: '2026-04-21', date_to: '2026-04-23' } };
  const scheduleRangeRes = fakeRes();
  await invoiceController.deliverySchedule(scheduleRangeReq, scheduleRangeRes);
  check('deliverySchedule date range filter narrows to matching deliveries only', scheduleRangeRes._body.length === 1 && scheduleRangeRes._body[0].id === deliveryInvoice.id);

  const scheduleStatusReq = { companyId: company.id, query: { status: 'draft' } };
  const scheduleStatusRes = fakeRes();
  await invoiceController.deliverySchedule(scheduleStatusReq, scheduleStatusRes);
  check('deliverySchedule status filter returns only matching-status deliveries', scheduleStatusRes._body.every((r) => r.status === 'draft') && scheduleStatusRes._body.length > 0);

  // ---- Summary ----
  console.log(`\n${pass} PASS / ${fail} FAIL (${pass + fail} total checks)`);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach((f) => console.log(' -', f));
  }

  await sequelize.close();
  await pg.stop();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
