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
  (res) => {
    // The Render backend can occasionally answer a request with an HTML page instead
    // of JSON — e.g. its own error page, a proxy timeout page, or (on the free tier)
    // a "waking up" holding page served while the server cold-starts after idling.
    // Axios only auto-parses JSON when the content-type says so, so in that case
    // res.data comes through as a raw HTML string. Pages then call .map()/.filter()
    // on that string assuming it's the array they asked for, which crashes the whole
    // page. Treat that case as a failed request instead of a successful one, so
    // pages keep whatever safe default state they already had and the user gets a
    // clear "please retry" toast instead of a blank screen.
    if (typeof res.data === 'string' && res.data.trim().startsWith('<')) {
      // NOTE: a fulfilled interceptor's own Promise.reject(...) does NOT flow into the
      // rejected-handler paired below (that one only sees errors thrown *before* this
      // step, e.g. network failures) — it goes straight to the caller's .catch(). So
      // this branch must show its own toast, or the request fails completely silently
      // (which is exactly what made login look like "nothing happens" on a cold start).
      const message = 'The server returned an unexpected response (it may still be starting up). Please try again in a few seconds.';
      toast.error(message);
      const fakeErr = new Error(message);
      fakeErr.isHtmlResponse = true;
      return Promise.reject(fakeErr);
    }
    return res;
  },
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
