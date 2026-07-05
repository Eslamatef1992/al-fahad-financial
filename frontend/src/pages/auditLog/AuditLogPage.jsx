import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

const ACTION_COLOR = {
  create: 'bg-emerald-50 text-emerald-600', update: 'bg-blue-50 text-blue-600',
  delete: 'bg-red-50 text-red-500', post: 'bg-navy-100 text-navy-700',
  cancel: 'bg-amber-50 text-amber-600',
};

export default function AuditLogPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', action: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = {};
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.action) params.action = filters.action;
    api.get('/audit-logs', { params }).then((r) => setLogs(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  return (
    <div>
      <PageHeader title={t('nav.auditLog')} subtitle={t('auditLog.subtitle')} />

      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div><label className="label">{t('common.from')}</label><input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
        <div><label className="label">{t('common.to')}</label><input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
        <div>
          <label className="label">{t('auditLog.action')}</label>
          <select className="input" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
            <option value="">{t('common.all')}</option>
            <option value="create">{t('auditLog.actions.create')}</option>
            <option value="update">{t('auditLog.actions.update')}</option>
            <option value="delete">{t('auditLog.actions.delete')}</option>
            <option value="post">{t('auditLog.actions.post')}</option>
            <option value="cancel">{t('auditLog.actions.cancel')}</option>
          </select>
        </div>
        <button onClick={load} className="btn-primary">{t('common.applyFilters')}</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-800">
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('auditLog.when')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('auditLog.user')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('auditLog.action')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('auditLog.resource')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('auditLog.path')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('auditLog.ip')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && logs.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">{t('common.noData')}</td></tr>}
            {!loading && logs.map((l) => (
              <tr key={l.id} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">{l.user ? `${l.user.name}` : '—'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${ACTION_COLOR[l.action] || 'bg-slate-100 text-slate-500'}`}>{t(`auditLog.actions.${l.action}`, { defaultValue: l.action })}</span></td>
                <td className="px-4 py-3 capitalize">{l.resource_type}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{l.path}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{l.ip_address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5"><ShieldCheck size={13} /> {t('auditLog.footnote')}</p>
    </div>
  );
}
