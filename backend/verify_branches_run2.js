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
    Invoice, InvoiceLine, Item, PurchaseOrder, PurchaseOrderLine,
    ItemBranchStock, InventoryTransaction, ItemVariant, ItemVariantBranchStock, StockTransferLine,
  } = models;

  const voucherService = require(path.join(process.cwd(), 'src/services/voucherService'));
  const invoiceService = require(path.join(process.cwd(), 'src/services/invoiceService'));
  const itemService = require(path.join(process.cwd(), 'src/services/itemService'));
  const purchaseOrderService = require(path.join(process.cwd(), 'src/services/purchaseOrderService'));
  const branchController = require(path.join(process.cwd(), 'src/controllers/branchController'));
  const reportController = require(path.join(process.cwd(), 'src/controllers/reportController'));
  const ledgerController = require(path.join(process.cwd(), 'src/controllers/ledgerController'));
  const invoiceController = require(path.join(process.cwd(), 'src/controllers/invoiceController'));
  const voucherController = require(path.join(process.cwd(), 'src/controllers/voucherController'));
  const itemController = require(path.join(process.cwd(), 'src/controllers/itemController'));
  const stockTransferController = require(path.join(process.cwd(), 'src/controllers/stockTransferController'));
  const inventoryReportController = require(path.join(process.cwd(), 'src/controllers/inventoryReportController'));

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
