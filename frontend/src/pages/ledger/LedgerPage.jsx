import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import api, { downloadFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

export default function LedgerPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [accounts, setAccounts] = useState([]);
  const [filters, setFilters] = useState({ account_id: '', from: '', to: '' });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (activeCompany) api.get('/accounts').then((r) => setAccounts(r.data.filter((a) => !a.is_group))); }, [activeCompany]);

  const search = () => {
    setLoading(true);
    const params = {};
    if (filters.account_id) params.account_id = filters.account_id;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    api.get('/ledger', { params }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) search(); }, [activeCompany]);

  return (
    <div>
      <PageHeader title={t('nav.ledger')} />

      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label className="label">{t('vouchers.account')}</label>
          <select className="input" value={filters.account_id} onChange={(e) => setFilters({ ...filters, account_id: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
          </select>
        </div>
        <div><label className="label">{t('common.from')}</label><input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
        <div><label className="label">{t('common.to')}</label><input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
        <button onClick={search} className="btn-primary">{t('common.applyFilters')}</button>
        <button
          onClick={() => downloadFile('/ledger/excel', filters, 'general-ledger.xlsx')}
          className="btn-ghost"
        >
          <Download size={16} /> {t('common.excel')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-800">
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('common.date')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('vouchers.account')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('ledger.voucher')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('common.description')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('vouchers.debit')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('vouchers.credit')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('common.balance')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">{t('common.noData')}</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                <td className="px-4 py-3">{r.date}</td>
                <td className="px-4 py-3">{r.account ? `${r.account.code} - ${r.account.name_en}` : '—'}</td>
                <td className="px-4 py-3">{r.Voucher?.voucher_no}</td>
                <td className="px-4 py-3">{r.description}</td>
                <td className="px-4 py-3 text-end">{Number(r.debit) > 0 ? Number(r.debit).toFixed(3) : ''}</td>
                <td className="px-4 py-3 text-end">{Number(r.credit) > 0 ? Number(r.credit).toFixed(3) : ''}</td>
                <td className="px-4 py-3 text-end font-semibold">{Number(r.running_balance).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
