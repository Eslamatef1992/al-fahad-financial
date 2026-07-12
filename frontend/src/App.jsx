import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/layouts/AppLayout';

import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import ChartOfAccountsPage from '@/pages/chartOfAccounts/ChartOfAccountsPage';
import VouchersPage from '@/pages/vouchers/VouchersPage';
import VoucherFormPage from '@/pages/vouchers/VoucherFormPage';
import VoucherDetailPage from '@/pages/vouchers/VoucherDetailPage';
import LedgerPage from '@/pages/ledger/LedgerPage';
import ClientsPage from '@/pages/clients/ClientsPage';
import SuppliersPage from '@/pages/suppliers/SuppliersPage';
import EmployeesPage from '@/pages/employees/EmployeesPage';
import VehiclesPage from '@/pages/vehicles/VehiclesPage';
import VehicleDetailPage from '@/pages/vehicles/VehicleDetailPage';
import CostCentersPage from '@/pages/costCenters/CostCentersPage';
import CashControlPage from '@/pages/cashControl/CashControlPage';
import ReportsHubPage from '@/pages/reports/ReportsHubPage';
import ProfitAndLossPage from '@/pages/reports/ProfitAndLossPage';
import BalanceSheetPage from '@/pages/reports/BalanceSheetPage';
import TrialBalancePage from '@/pages/reports/TrialBalancePage';
import AgingPage from '@/pages/reports/AgingPage';
import CompaniesPage from '@/pages/companies/CompaniesPage';
import UsersPage from '@/pages/users/UsersPage';
import AuditLogPage from '@/pages/auditLog/AuditLogPage';
import SalesInvoicesPage from '@/pages/invoices/SalesInvoicesPage';
import PurchaseInvoicesPage from '@/pages/invoices/PurchaseInvoicesPage';
import InvoiceFormPage from '@/pages/invoices/InvoiceFormPage';
import InvoiceDetailPage from '@/pages/invoices/InvoiceDetailPage';
import RecurringInvoicesPage from '@/pages/recurringInvoices/RecurringInvoicesPage';

export default function App() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chart-of-accounts" element={<ChartOfAccountsPage />} />
          <Route path="/vouchers" element={<VouchersPage />} />
          <Route path="/vouchers/new" element={<VoucherFormPage />} />
          <Route path="/vouchers/:id/edit" element={<VoucherFormPage />} />
          <Route path="/vouchers/:id" element={<VoucherDetailPage />} />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
          <Route path="/cost-centers" element={<CostCentersPage />} />
          <Route path="/cash-control" element={<CashControlPage />} />
          <Route path="/reports" element={<ReportsHubPage />} />
          <Route path="/reports/profit-and-loss" element={<ProfitAndLossPage />} />
          <Route path="/reports/balance-sheet" element={<BalanceSheetPage />} />
          <Route path="/reports/trial-balance" element={<TrialBalancePage />} />
          <Route path="/reports/aging/:type" element={<AgingPage />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/invoices/sales" element={<SalesInvoicesPage />} />
          <Route path="/invoices/purchase" element={<PurchaseInvoicesPage />} />
          <Route path="/invoices/:type/new" element={<InvoiceFormPage />} />
          <Route path="/invoices/:type/edit/:id" element={<InvoiceFormPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/recurring-invoices" element={<RecurringInvoicesPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
