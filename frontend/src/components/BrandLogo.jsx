import { useState } from 'react';

// The system (product) logo — always Naqdix. Companies upload their own logo
// separately (Companies page); that one is used on invoices/reports only.
// Drop the artwork at frontend/public/naqdix-logo.png; a text wordmark is shown
// until the file exists.
export default function BrandLogo({ className = 'h-9' }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="font-extrabold text-xl tracking-tight text-navy-800 dark:text-white">Naqdi<span className="text-sky-500">X</span></span>;
  }
  return <img src="/naqdix-logo.png" alt="Naqdix" onError={() => setFailed(true)} className={`w-auto object-contain ${className}`} />;
}
