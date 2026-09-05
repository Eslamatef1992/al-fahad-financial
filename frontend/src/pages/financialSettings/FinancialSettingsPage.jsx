import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import AccountPicker from '@/components/AccountPicker';

const FIELDS = [
  'client_parent_account_id',
  'supplier_parent_account_id',
  'employee_parent_account_id',
  'employee_deduction_parent_account_id',
  'vehicle_parent_account_id',
  'vehicle_secondary_parent_account_id',
  'vehicle_tertiary_parent_account_id',
  'cost_center_parent_account_id',
  'item_inventory_account_id',
  'item_income_account_id',
  'item_cogs_account_id',
  'pos_cash_account_id',
  'pos_knet_account_id',
  'cash_control_account_id',
];

export default function FinancialSettingsPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/financial-settings').then((r) => setForm(r.data || {})).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      FIELDS.forEach((f) => { payload[f] = form[f] || null; });
      const { data } = await api.put('/financial-settings', payload);
      setForm(data);
      toast.success(t('common.save'));
    } finally { setSaving(false); }
  };

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  if (loading) return <div className="p-8 text-slate-400">{t('common.loading')}</div>;

  return (
    <div>
      <PageHeader title={t('nav.financialSettings')} />
      <p className="text-sm text-slate-500 mb-4 max-w-2xl">{t('financialSettings.pageHint')}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">{t('nav.clients')}</h3>
          <AccountPicker value={form.client_parent_account_id} onChange={set('client_parent_account_id')} label={t('financialSettings.clientDefault')} />
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">{t('nav.suppliers')}</h3>
          <AccountPicker value={form.supplier_parent_account_id} onChange={set('supplier_parent_account_id')} label={t('financialSettings.supplierDefault')} />
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">{t('nav.employees')}</h3>
          <AccountPicker value={form.employee_parent_account_id} onChange={set('employee_parent_account_id')} label={t('financialSettings.employeeDefault')} />
          <AccountPicker value={form.employee_deduction_parent_account_id} onChange={set('employee_deduction_parent_account_id')} label={t('financialSettings.employeeDeductionDefault')} />
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">{t('nav.vehicles')}</h3>
          <AccountPicker value={form.vehicle_parent_account_id} onChange={set('vehicle_parent_account_id')} label={t('financialSettings.vehicleDefault')} />
          <AccountPicker value={form.vehicle_secondary_parent_account_id} onChange={set('vehicle_secondary_parent_account_id')} label={t('financialSettings.vehicleSecondaryDefault')} />
          <AccountPicker value={form.vehicle_tertiary_parent_account_id} onChange={set('vehicle_tertiary_parent_account_id')} label={t('financialSettings.vehicleTertiaryDefault')} />
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">{t('nav.costCenters')}</h3>
          <AccountPicker value={form.cost_center_parent_account_id} onChange={set('cost_center_parent_account_id')} label={t('financialSettings.costCenterDefault')} />
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">{t('nav.items')}</h3>
          <AccountPicker value={form.item_inventory_account_id} onChange={set('item_inventory_account_id')} label={t('financialSettings.itemInventoryDefault')} />
          <AccountPicker value={form.item_income_account_id} onChange={set('item_income_account_id')} label={t('financialSettings.itemIncomeDefault')} />
          <AccountPicker value={form.item_cogs_account_id} onChange={set('item_cogs_account_id')} label={t('financialSettings.itemCogsDefault')} />
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">{t('nav.pos')}</h3>
          <AccountPicker value={form.pos_cash_account_id} onChange={set('pos_cash_account_id')} label={t('financialSettings.posCashDefault')} />
          <AccountPicker value={form.pos_knet_account_id} onChange={set('pos_knet_account_id')} label={t('financialSettings.posKnetDefault')} />
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">{t('nav.cashControl')}</h3>
          <AccountPicker value={form.cash_control_account_id} onChange={set('cash_control_account_id')} label={t('financialSettings.cashControlDefault')} />
        </div>
      </div>

      <div className="mt-6">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? t('common.loading') : t('common.save')}</button>
      </div>
    </div>
  );
}
