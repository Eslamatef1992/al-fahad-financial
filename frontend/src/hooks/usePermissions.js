import { useAuthStore } from '@/store/authStore';
import { useCompanyStore } from '@/store/companyStore';

const RANK = { viewer: 1, accountant: 2, admin: 3 };

// Mirrors the backend's role rules (see backend/src/middleware/permissions.js) so
// the UI can hide/disable actions the API would reject anyway.
export default function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const activeCompany = useCompanyStore((s) => s.activeCompany);

  const isSuperAdmin = user?.role === 'super_admin';
  const role = isSuperAdmin ? 'admin' : activeCompany?.company_role || 'viewer';
  const rank = RANK[role] || 0;

  return {
    role,
    isSuperAdmin,
    canView: rank >= RANK.viewer,
    canCreateEdit: rank >= RANK.accountant, // create/edit operational records, post vouchers
    canDelete: rank >= RANK.admin,          // delete + structural changes (chart of accounts, cost centers)
    canManageStructure: rank >= RANK.admin, // chart of accounts / cost centers mutations
  };
}
