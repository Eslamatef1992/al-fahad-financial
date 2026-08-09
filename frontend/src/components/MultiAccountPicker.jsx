import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import api from '@/api/client';

// Open-ended, tag-style multi-select over the active Chart of Accounts —
// lets a Branch link to any number of accounts (its own cash account, a
// dedicated revenue account, an expense account, etc.), unlike AccountPicker
// which only ever selects one parent account.
export default function MultiAccountPicker({ value = [], onChange, label }) {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => { api.get('/accounts').then((r) => setAccounts(r.data)); }, []);

  const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  const filtered = search
    ? sorted.filter((a) => `${a.code} ${a.name_en} ${a.name_ar}`.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  const toggle = (id) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div>
      <label className="label">{label || t('branches.linkedAccounts')}</label>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input !pl-9 !py-1.5 text-sm"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="border border-slate-200 dark:border-navy-700 rounded-xl max-h-48 overflow-y-auto p-2 space-y-0.5">
        {filtered.length === 0 && <p className="text-xs text-slate-400 px-2 py-3">{t('common.noData')}</p>}
        {filtered.map((a) => (
          <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800/50 cursor-pointer text-sm">
            <input type="checkbox" className="rounded" checked={value.includes(a.id)} onChange={() => toggle(a.id)} />
            <span className="truncate">{a.code} - {a.name_en}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-1">{t('branches.linkedAccountsHint')}</p>
    </div>
  );
}
