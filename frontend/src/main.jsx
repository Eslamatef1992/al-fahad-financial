import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import PageErrorBoundary from './components/PageErrorBoundary.jsx';
import './i18n';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PageErrorBoundary>
      <BrowserRouter>
        <App />
        <Toaster position="top-center" toastOptions={{ duration: 3500 }} />
      </BrowserRouter>
    </PageErrorBoundary>
  </React.StrictMode>
);
