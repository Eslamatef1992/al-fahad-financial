import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCompanyStore = create(
  persist(
    (set) => ({
      companies: [],
      activeCompany: null,
      setCompanies: (companies) => set({ companies }),
      setActiveCompany: (company) => set({ activeCompany: company }),
    }),
    { name: 'af-company' }
  )
);
