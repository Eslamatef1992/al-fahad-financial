import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

const PERMISSIONS = ['void', 'credit_sale'];

export default function PosCashiersPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/pos/cashiers').then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const updateLocal = (userId, patch) => {
    setRows((prev) => prev.map((r) => r.user_id === userId ? { ...r, ...patch } : r));
  };

  const togglePermission = (userId, perm) => {
    setRows((prev) => prev.map((r) => {
      if (r.user_id !== userId) return r;
      const has = r.pos_permissions.includes(perm);
      return { ...r, pos_permissions: has ? r.pos_permissions.filter((p) => p !== perm) : [...r.pos_permissions, perm] };
    }));
  };

  const save = async (row) => {
    setSavingId(row.user_id);
    try {
      await api.put(`/pos/cashiers/${row.user_id}`, { pos_role: row.pos_role, pos_permissions: row.pos_permissions });
      toast.success(t('common.saved'));
    } catch (e) { /* toast handled globally */ }
    finally { setSavingId(null); }
  };

  return (
    <div>
      <PageHeader title={t('pos.cashierPermissions')} />
      <p className="text-sm text-slate-500 mb-4 max-w-2xl">{t('pos.cashierPermissionsHint')}</p>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-slate-400 border-b border-slate-100 dark:border-navy-800">
              <th className="px-4 py-3 text-start">{t('common.name')}</th>
              <th className="px-4 py-3 text-start">{t('pos.posRole')}</th>
              <th className="px-4 py-3 text-start">{t('pos.canVoid')}</th>
              <th className="px-4 py-3 text-start">{t('pos.canCreditSale')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.user_id} className="border-b border-slate-50 dark:border-navy-800/60">
                <td className="px-4 py-3">
                  <p className="font-medium text-navy-900 dark:text-white">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select className="input !py-1.5" value={r.pos_role} onChange={(e) => updateLocal(r.user_id, { pos_role: e.target.value })}>
                    <option value="none">{t('pos.role_none')}</option>
                    <option value="cashier">{t('pos.role_cashier')}</option>
                    <option value="operator">{t('pos.role_operator')}</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={r.pos_permissions.includes('void')} onChange={() => togglePermission(r.user_id, 'void')} disabled={r.pos_role !== 'cashier'} />
                </td>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={r.pos_permissions.includes('credit_sale')} onChange={() => togglePermission(r.user_id, 'credit_sale')} disabled={r.pos_role !== 'cashier'} />
                </td>
                <td className="px-4 py-3 text-end">
                  <button onClick={() => save(r)} disabled={savingId === r.user_id} className="btn-ghost flex items-center gap-1.5">
                    <Save size={14} />{savingId === r.user_id ? t('common.loading') : t('common.save')}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !rows.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{t('common.noData')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
