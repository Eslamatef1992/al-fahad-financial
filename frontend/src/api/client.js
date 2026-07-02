import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { useCompanyStore } from '@/store/companyStore';
import toast from 'react-hot-toast';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  const company = useCompanyStore.getState().activeCompany;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (company?.id) config.headers['X-Company-Id'] = company.id;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.message || err.message || 'Request failed';
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    toast.error(message);
    return Promise.reject(err);
  }
);

// Resolves an /uploads/... relative path returned by the API into a full URL
// that works both in dev (proxied by Vite) and production (separate API domain).
export function fileUrl(relativePath) {
  if (!relativePath) return '';
  if (/^https?:\/\//.test(relativePath)) return relativePath;
  const apiBase = import.meta.env.VITE_API_URL || '/api';
  const origin = apiBase.replace(/\/api\/?$/, '');
  return `${origin}${relativePath}`;
}

// Downloads a file (PDF/Excel) from an authenticated endpoint and triggers
// a browser save — needed because plain <a href> can't carry auth headers.
export async function downloadFile(url, params, fallbackName) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackName;

  const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export default api;
