import { useEffect, useState } from 'react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';

// Fetches the active company's pre-configured default parent/direct accounts
// (see Financial Configuration page) so "Add New" forms across Clients,
// Suppliers, Employees, Vehicles, Cost Centers, and Items can pre-fill their
// account picker(s) instead of asking the user to choose every time. Returns
// {} until loaded (or if nothing has been configured yet), which every
// consumer already treats as "no default" — zero behavior change for
// companies that never touch Financial Configuration.
export default function useFinancialDefaults() {
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [defaults, setDefaults] = useState({});

  useEffect(() => {
    if (!activeCompany) return;
    api.get('/financial-settings').then((r) => setDefaults(r.data || {})).catch(() => setDefaults({}));
  }, [activeCompany]);

  return defaults;
}
