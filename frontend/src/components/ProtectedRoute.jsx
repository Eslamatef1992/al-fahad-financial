import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export const isPosHost = () => typeof window !== 'undefined' && /^pos\./i.test(window.location.hostname);

export default function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to={isPosHost() ? '/pos-login' : '/login'} replace />;
  return <Outlet />;
}
