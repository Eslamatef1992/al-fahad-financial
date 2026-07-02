import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Lock, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useCompanyStore } from '@/store/companyStore';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const { setCompanies, setActiveCompany } = useCompanyStore();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      setSession(data.token, data.user);
      setCompanies(data.companies || []);
      if (data.companies?.[0]) setActiveCompany(data.companies[0]);
      toast.success(`${t('auth.welcome')}, ${data.user.name}`);
      navigate('/');
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 relative overflow-hidden p-4">
      <div className="absolute -top-40 -start-40 w-96 h-96 rounded-full bg-navy-700/40 blur-3xl" />
      <div className="absolute -bottom-40 -end-40 w-96 h-96 rounded-full bg-gold-500/20 blur-3xl" />

      <div className="absolute top-5 end-5"><LanguageSwitcher /></div>

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gold-500 text-navy-950 flex items-center justify-center font-extrabold text-xl mx-auto mb-4">AF</div>
          <h1 className="text-white font-bold text-2xl">{t('app.name')}</h1>
          <p className="text-slate-400 text-sm mt-1">{t('app.tagline')}</p>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-4 bg-white/95">
          <div>
            <label className="label">{t('auth.email')}</label>
            <div className="relative">
              <Mail size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
              <input required type="email" className="input !ps-9" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" />
            </div>
          </div>
          <div>
            <label className="label">{t('auth.password')}</label>
            <div className="relative">
              <Lock size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
              <input required type="password" className="input !ps-9" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-gold w-full mt-2">
            {loading ? t('common.loading') : t('auth.login')}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
