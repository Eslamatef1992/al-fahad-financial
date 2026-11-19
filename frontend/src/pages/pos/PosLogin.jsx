import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Lock, User, Store, KeyRound, UserCircle2 } from 'lucide-react';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useCompanyStore } from '@/store/companyStore';
import BrandLogo from '@/components/BrandLogo';
import LanguageSwitcher from '@/components/LanguageSwitcher';

// Sign-in for the POS-only site (pos.<domain>): choose a branch, then either
// username + password, or the branch's shared password (+ who is selling).
export default function PosLogin() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const { setCompanies, setActiveCompany } = useCompanyStore();
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(() => localStorage.getItem('pos.loginBranch') || '');
  const [mode, setMode] = useState('user'); // user | branch
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', salesperson_id: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/pos-auth/branches').then((r) => setBranches(r.data || [])).catch(() => {}); }, []);
  const branch = branches.find((b) => b.id === branchId);
  useEffect(() => {
    if (branchId && !branch && branches.length) setBranchId('');
    if (branch) {
      if (mode === 'user' && !branch.has_operators && branch.has_branch_password) setMode('branch');
      if (mode === 'branch' && !branch.has_branch_password && branch.has_operators) setMode('user');
    }
  }, [branchId, branches]); // eslint-disable-line
  useEffect(() => {
    if (branchId && mode === 'branch') api.get('/pos-auth/salespeople', { params: { branch_id: branchId } }).then((r) => setPeople(r.data || [])).catch(() => setPeople([]));
  }, [branchId, mode]);

  const bname = (b) => (isAr ? b.name_ar || b.name_en : b.name_en);

  const submit = async (e) => {
    e.preventDefault();
    if (!branchId) return toast.error(L('Choose a branch', 'اختر الفرع'));
    setLoading(true);
    try {
      const { data } = mode === 'user'
        ? await api.post('/pos-auth/login', { branch_id: branchId, username: form.username, password: form.password })
        : await api.post('/pos-auth/branch-login', { branch_id: branchId, password: form.password, salesperson_id: form.salesperson_id || null });
      localStorage.setItem('pos.loginBranch', branchId);
      setSession(data.token, data.user);
      setCompanies(data.companies || []);
      if (data.companies?.[0]) setActiveCompany(data.companies[0]);
      navigate('/pos');
    } catch { /* toast from interceptor */ } finally { setLoading(false); }
  };

  const tab = (k, label, Icon, enabled) => (
    <button type="button" disabled={!enabled} onClick={() => setMode(k)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition ${mode === k ? 'bg-white dark:bg-navy-800 shadow text-navy-900 dark:text-white' : 'text-slate-500'} disabled:opacity-40`}>
      <Icon size={15} />{label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-sky-50 dark:bg-navy-950">
      <header className="bg-navy-900 h-16 px-6 flex items-center justify-between">
        <div className="bg-white rounded-xl px-3 py-1"><BrandLogo className="h-8" /></div>
        <LanguageSwitcher />
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={submit} className="card p-7 w-full max-w-md space-y-4">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center mb-2"><Store size={24} /></div>
            <h1 className="text-xl font-bold text-navy-900 dark:text-white">{L('Point of Sale', 'نقطة البيع')}</h1>
            <p className="text-sm text-slate-500">{L('Select your branch and sign in', 'اختر الفرع وسجّل الدخول')}</p>
          </div>

          <div>
            <label className="label">{L('Branch', 'الفرع')}</label>
            <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
              <option value="">{L('Select branch…', 'اختر الفرع…')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{bname(b)}</option>)}
            </select>
          </div>

          {branch && (
            <>
              <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-navy-900">
                {tab('user', L('My account', 'حسابي'), UserCircle2, branch.has_operators)}
                {tab('branch', L('Branch password', 'كلمة مرور الفرع'), KeyRound, branch.has_branch_password)}
              </div>

              {mode === 'user' ? (
                <div>
                  <label className="label">{L('Username', 'اسم المستخدم')}</label>
                  <div className="relative">
                    <User size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
                    <input className="input ps-9" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="label">{L('Sales person', 'مندوب المبيعات')}</label>
                  <select className="input" value={form.salesperson_id} onChange={(e) => setForm({ ...form, salesperson_id: e.target.value })}>
                    <option value="">—</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{isAr ? p.name_ar || p.name_en : p.name_en}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="label">{L('Password', 'كلمة المرور')}</label>
                <div className="relative">
                  <Lock size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
                  <input type="password" className="input ps-9" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                </div>
              </div>
              <button className="btn-primary w-full" disabled={loading}>{loading ? '…' : L('Sign in', 'تسجيل الدخول')}</button>
            </>
          )}
          {!branches.length && <p className="text-center text-sm text-slate-400">{L('No branches are enabled for POS sign-in yet.', 'لا توجد فروع مفعّلة لتسجيل الدخول بعد.')}</p>}
        </form>
      </div>
    </div>
  );
}
