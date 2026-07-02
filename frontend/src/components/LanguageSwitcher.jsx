import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const toggle = () => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar');
  return (
    <button onClick={toggle} className="btn-ghost !px-3" title="Switch language">
      <Languages size={18} />
      <span className="text-sm font-semibold">{i18n.language === 'ar' ? 'EN' : 'AR'}</span>
    </button>
  );
}
