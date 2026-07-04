import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';

// A flat, indented dropdown over the active Chart of Accounts, used to let the user pick
// which account a new Client/Supplier/Vehicle should be nested under (e.g. Accounts
// Payable 2100). The backend then auto-creates a sub-account under that parent using the
// entity's own code, so it shows up directly in the tree without any manual COA work.
export default function AccountPicker({ value, onChange, label }) {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState([]);

  useEffect(() => { api.get('/accounts').then((r) => setAccounts(r.data)); }, []);

  const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div>
      <label className="label">{label || t('accounts.parentAccount')}</label>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{t('accounts.noneOption')}</option>
        {sorted.map((a) => (
          <option key={a.id} value={a.id}>
            {'— '.repeat(Math.max(0, a.level - 1))}{a.code} - {a.name_en}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-400 mt-1">{t('accounts.parentAccountHint')}</p>
    </div>
  );
}
