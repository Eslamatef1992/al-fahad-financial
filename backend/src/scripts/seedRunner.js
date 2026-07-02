// Shared seed logic used by both the standalone `npm run db:seed` script and
// the AUTO_MIGRATE boot path in server.js (for platforms with no shell access).
const bcrypt = require('bcryptjs');

const COMPANIES = [
  { code: 'ALFAHAD', name_en: 'Al Fahad Joint Construction Company', name_ar: 'شركة الفهد المشتركة لتشييد المباني', industry: 'Construction' },
  { code: 'KENZAN-CLEAN', name_en: 'Kenzan General Cleaning Services', name_ar: 'كنزان للخدمات العامة للتنظيف', industry: 'Cleaning' },
  { code: 'SPEEDFLEET', name_en: 'Speed Fleet', name_ar: 'سبيد فليت', industry: 'Fleet / Transport' },
  { code: 'VALET90', name_en: '90 Valet Parking', name_ar: '90 خدمات صف السيارات', industry: 'Valet Parking' },
  { code: 'KENZAN-DELIVERY', name_en: 'Kenzan Consumer Delivery', name_ar: 'كنزان للتوصيل', industry: 'Delivery' },
  { code: 'FAHAD-DELIVERY', name_en: 'Fahad Kuwaiti Delivery Company', name_ar: 'شركة الفهد الكويتية للتوصيل', industry: 'Delivery' },
  { code: 'ALOULA', name_en: 'Al Oula Company for Transaction Follow-up', name_ar: 'شركة الاولى لتعقيب المعاملات', industry: 'Services' },
];

const BASE_ACCOUNTS = [
  { code: '1000', name_en: 'Assets', name_ar: 'الأصول', type: 'asset', normal_balance: 'debit', is_group: true },
  { code: '1100', name_en: 'Current Assets', name_ar: 'الأصول المتداولة', type: 'asset', normal_balance: 'debit', is_group: true, parentCode: '1000' },
  { code: '1110', name_en: 'Cash', name_ar: 'الصندوق', type: 'asset', normal_balance: 'debit', parentCode: '1100' },
  { code: '1120', name_en: 'Bank Accounts', name_ar: 'حسابات البنوك', type: 'asset', normal_balance: 'debit', parentCode: '1100' },
  { code: '1130', name_en: 'Accounts Receivable - Clients', name_ar: 'ذمم العملاء', type: 'asset', normal_balance: 'debit', parentCode: '1100' },
  { code: '2000', name_en: 'Liabilities', name_ar: 'الالتزامات', type: 'liability', normal_balance: 'credit', is_group: true },
  { code: '2100', name_en: 'Accounts Payable - Suppliers', name_ar: 'ذمم الموردين', type: 'liability', normal_balance: 'credit', parentCode: '2000' },
  { code: '3000', name_en: 'Equity', name_ar: 'حقوق الملكية', type: 'equity', normal_balance: 'credit', is_group: true },
  { code: '3100', name_en: "Owner's Capital", name_ar: 'رأس المال', type: 'equity', normal_balance: 'credit', parentCode: '3000' },
  { code: '4000', name_en: 'Revenue', name_ar: 'الإيرادات', type: 'revenue', normal_balance: 'credit', is_group: true },
  { code: '4100', name_en: 'Service Revenue', name_ar: 'إيرادات الخدمات', type: 'revenue', normal_balance: 'credit', parentCode: '4000' },
  { code: '5000', name_en: 'Expenses', name_ar: 'المصروفات', type: 'expense', normal_balance: 'debit', is_group: true },
  { code: '5100', name_en: 'Salaries & Wages', name_ar: 'الرواتب والأجور', type: 'expense', normal_balance: 'debit', parentCode: '5000' },
  { code: '5200', name_en: 'Vehicle & Fleet Expenses', name_ar: 'مصروفات المركبات', type: 'expense', normal_balance: 'debit', parentCode: '5000' },
  { code: '5300', name_en: 'General & Administrative Expenses', name_ar: 'مصروفات إدارية وعمومية', type: 'expense', normal_balance: 'debit', parentCode: '5000' },
];

async function seedChartOfAccounts(Account, CostCenter, companyId) {
  const codeToId = {};
  for (const acc of BASE_ACCOUNTS) {
    const parent_id = acc.parentCode ? codeToId[acc.parentCode] : null;
    const level = acc.parentCode ? 2 : 1;
    const created = await Account.create({
      company_id: companyId,
      parent_id,
      code: acc.code,
      name_en: acc.name_en,
      name_ar: acc.name_ar,
      type: acc.type,
      normal_balance: acc.normal_balance,
      is_group: !!acc.is_group,
      level,
    });
    codeToId[acc.code] = created.id;
  }
  await CostCenter.create({ company_id: companyId, code: 'GEN', name_en: 'General', name_ar: 'عام' });
}

module.exports = async function runSeed(models) {
  const { Company, User, UserCompany, Account, CostCenter } = models;

  const companies = [];
  for (const c of COMPANIES) {
    const [company] = await Company.findOrCreate({ where: { code: c.code }, defaults: c });
    companies.push(company);
    const existing = await Account.count({ where: { company_id: company.id } });
    if (existing === 0) await seedChartOfAccounts(Account, CostCenter, company.id);
  }

  const adminEmail = 'admin@alfahadgroup.com';
  let admin = await User.findOne({ where: { email: adminEmail } });
  if (!admin) {
    const password_hash = await bcrypt.hash('ChangeMe123!', 10);
    admin = await User.create({ name: 'System Administrator', email: adminEmail, password_hash, role: 'super_admin' });
    console.log(`Created super admin: ${adminEmail} / ChangeMe123! (change this immediately)`);
  }

  for (const company of companies) {
    await UserCompany.findOrCreate({ where: { user_id: admin.id, company_id: company.id }, defaults: { role: 'admin' } });
  }

  console.log(`Seeded ${companies.length} companies with starter chart of accounts.`);
};
