import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Search } from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';

const m = (n) => Number(n || 0).toFixed(3);

// All clients with their outstanding balance; click a row to open the account statement.
export default function ClientBalancesPage() {
  const { L, isAr } = useOutletContext();
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [clients, setClients] = useState([]);
  const [due, setDue] = useState({});
  const [q, setQ] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    Promise.all([api.get('/clients'), api.get('/pos/client-balances')])
      .then(([c, b]) => { setClients(c.data || []); setDue(b.data || {}); })
      .finally(() => setLoading(false));
  }, [activeCompany]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return clients
      .filter((c) => (!onlyDue || due[c.id] > 0) && (!s || [c.name_en, c.name_ar, c.phone, c.code].some((v) => String(v || '').toLowerCase().includes(s))))
      .sort((a, b) => (due[b.id] || 0) - (due[a.id] || 0) || String(a.name_en).localeCompare(String(b.name_en)));
  }, [clients, due, q, onlyDue]);
  const total = rows.reduce((s, c) => s + (due[c.id] || 0), 0);

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-3 border-b border-slate-100 dark:border-navy-800">
        <div className="relative flex-1 min-w-[220px]">
          {!q && <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400 pointer-events-none" />}
          <input className={`input ${q ? '' : '!ps-9'}`} placeholder={L('Search by name, phone or code…', 'ابحث بالاسم أو الهاتف أو الكود…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="rounded" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
          {L('Only clients with a due balance', 'العملاء أصحاب الرصيد المستحق فقط')}
        </label>
        <p className="text-sm ms-auto">{L('Total due', 'إجمالي المستحق')}: <b className="text-rose-600">{m(total)}</b></p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="text-start px-3 py-2.5">{L('Code', 'الكود')}</th>
              <th className="text-start px-3 py-2.5">{L('Client', 'العميل')}</th>
              <th className="text-start px-3 py-2.5">{L('Phone', 'الهاتف')}</th>
              <th className="text-end px-3 py-2.5">{L('Due balance', 'الرصيد المستحق')}</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} onClick={() => navigate(`/clients/${c.id}/statement`)} className="border-t border-slate-100 dark:border-navy-800 cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-navy-900/50">
                <td className="px-3 py-2 text-slate-400">{c.code}</td>
                <td className="px-3 py-2 font-medium">{(isAr ? c.name_ar : null) || c.name_en}</td>
                <td className="px-3 py-2" dir="ltr">{c.phone || '—'}</td>
                <td className={`px-3 py-2 text-end tabular-nums font-semibold ${due[c.id] > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{m(due[c.id])}</td>
                <td className="px-3 py-2 text-end"><span className="text-xs font-semibold text-indigo-600">{L('Statement', 'كشف الحساب')} ›</span></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">{loading ? L('Loading…', 'جارٍ التحميل…') : L('No clients', 'لا يوجد عملاء')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
