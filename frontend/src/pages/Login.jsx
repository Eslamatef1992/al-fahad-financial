import BrandLogo from '@/components/BrandLogo';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="min-h-screen flex flex-col bg-white dark:bg-navy-950">
      <header className="bg-navy-900 h-16 px-6 lg:px-12 flex items-center justify-between">
        <div className="bg-white rounded-xl px-3 py-1"><BrandLogo className="h-8" /></div>
        <LanguageSwitcher />
      </header>

      <div className="flex-1 grid lg:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden lg:flex flex-col items-center justify-center bg-white p-12 text-center">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
            <BrandLogo className="h-48" />
          </motion.div>
          <p className="mt-10 text-lg text-slate-600 max-w-sm leading-relaxed">{t('app.tagline')}</p>
        </div>

        {/* Form panel */}
        <div className="flex items-center bg-sky-50 dark:bg-navy-900 px-6 sm:px-12 lg:px-20 py-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            className="w-full max-w-md mx-auto"
          >
            <div className="lg:hidden mb-6 flex justify-center"><BrandLogo className="h-24" /></div>
            <h1 className="text-3xl font-bold text-slate-700 dark:text-white mb-8">{t('auth.login')}</h1>

            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="label">{t('auth.email')}</label>
                <div className="relative">
                  <Mail size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
                  <input required type="email" className="input !ps-9 !py-3.5" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" />
                </div>
              </div>
              <div>
                <label className="label">{t('auth.password')}</label>
                <div className="relative">
                  <Lock size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
                  <input required type={showPassword ? 'text' : 'password'} className="input !ps-9 !pe-9 !py-3.5" value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="absolute top-1/2 -translate-y-1/2 end-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 !bg-navy-900 hover:!bg-navy-800 text-base">
                {loading ? t('common.loading') : t('auth.login')}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500 mt-10">
              Powered by <a href="https://teknulugy.com" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-500 font-medium">Teknulugy</a>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
