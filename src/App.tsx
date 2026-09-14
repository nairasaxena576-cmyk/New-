import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth/auth-context';
import { ProtectedRoute, GuestRoute } from '@/components/auth/protected-route';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { DashboardLayout } from '@/components/layouts/dashboard-layout';
import { AdminLayout } from '@/components/layouts/admin-layout';
import { LoginPage } from '@/pages/auth/login';
import { RegisterPage } from '@/pages/auth/register';
import { HomePage } from '@/pages/user/home';
import { StartPage } from '@/pages/user/start';
import { OrdersPage } from '@/pages/user/orders';
import { RechargePage } from '@/pages/user/recharge';
import { WithdrawalPage } from '@/pages/user/withdrawal';
import { ServicePage } from '@/pages/user/service';
import { AccountPage } from '@/pages/user/account';
import { AdminDashboard } from '@/pages/admin/admin-dashboard';
import { AdminUsersPage } from '@/pages/admin/admin-users';
import { AdminDepositsPage } from '@/pages/admin/admin-deposits';
import { AdminWithdrawalsPage } from '@/pages/admin/admin-withdrawals';
import { AdminOrdersPage } from '@/pages/admin/admin-orders';
import { AdminProductsPage } from '@/pages/admin/admin-products';
import { AdminLuckyProductsPage } from '@/pages/admin/admin-lucky-products';
import { AdminVipPage } from '@/pages/admin/admin-vip';
import { AdminAnnouncementsPage } from '@/pages/admin/admin-announcements';
import { AdminFinancePage } from '@/pages/admin/admin-finance';
import { AdminReportsPage } from '@/pages/admin/admin-reports';
import { AdminActivityLogsPage } from '@/pages/admin/admin-activity-logs';
import { AdminSettingsPage } from '@/pages/admin/admin-settings';
import { AdminTicketsPage } from '@/pages/admin/admin-tickets';
import { AdminWalletsPage } from '@/pages/admin/admin-wallets';
import { AdminFaqsPage } from '@/pages/admin/admin-faqs';
import { NotFoundPage } from '@/pages/not-found';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Authentication — guests only */}
          <Route
            element={
              <GuestRoute>
                <AuthLayout />
              </GuestRoute>
            }
          >
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* User dashboard — authenticated users only */}
          <Route
            element={
              <ProtectedRoute role="user">
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/home" element={<HomePage />} />
            <Route path="/start" element={<StartPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/recharge" element={<RechargePage />} />
            <Route path="/withdrawal" element={<WithdrawalPage />} />
            <Route path="/service" element={<ServicePage />} />
            <Route path="/account" element={<AccountPage />} />
          </Route>

          {/* Admin dashboard — admin role only */}
          <Route
            element={
              <ProtectedRoute role="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/deposits" element={<AdminDepositsPage />} />
            <Route path="/admin/withdrawals" element={<AdminWithdrawalsPage />} />
            <Route path="/admin/orders" element={<AdminOrdersPage />} />
            <Route path="/admin/products" element={<AdminProductsPage />} />
            <Route path="/admin/lucky-products" element={<AdminLuckyProductsPage />} />
            <Route path="/admin/vip" element={<AdminVipPage />} />
            <Route path="/admin/announcements" element={<AdminAnnouncementsPage />} />
            <Route path="/admin/finance" element={<AdminFinancePage />} />
            <Route path="/admin/reports" element={<AdminReportsPage />} />
            <Route path="/admin/activity-logs" element={<AdminActivityLogsPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
            <Route path="/admin/tickets" element={<AdminTicketsPage />} />
            <Route path="/admin/support" element={<AdminTicketsPage />} />
            <Route path="/admin/service" element={<AdminTicketsPage />} />
            <Route path="/admin/wallets" element={<AdminWalletsPage />} />
            <Route path="/admin/faqs" element={<AdminFaqsPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
