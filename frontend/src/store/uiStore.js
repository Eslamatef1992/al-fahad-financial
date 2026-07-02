import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUiStore = create(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      theme: 'light',
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
    }),
    { name: 'af-ui' }
  )
);
