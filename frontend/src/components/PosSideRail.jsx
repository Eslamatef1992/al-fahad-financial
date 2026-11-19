import { useEffect } from 'react';

// Slim dark action rail (icons only, label + shortcut on hover) shared by the POS look-alike screens.
// items: [{ icon, label, onClick, shortcut?: 'Alt+N', code?: 'KeyN', badge?, active? }]
export default function PosSideRail({ items }) {
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const it = items.find((x) => x.code === e.code);
      if (it) { e.preventDefault(); it.onClick(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-black py-2 px-1.5 shrink-0 sticky top-16 z-40 shadow-lg print:hidden">
      {items.map((it) => (
        <button
          key={it.label} type="button" onClick={it.onClick} aria-label={it.label}
          className={`relative group w-11 h-11 rounded-xl flex items-center justify-center text-white transition-colors ${it.active ? 'bg-white/25' : 'hover:bg-white/15'}`}
        >
          <it.icon size={22} strokeWidth={1.8} />
          <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-full ms-2 z-50 whitespace-nowrap rounded-md bg-navy-900 text-white text-[11px] font-semibold px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg flex items-center gap-2">
            {it.label}
            {it.shortcut && <kbd className="font-sans text-[10px] text-slate-300 bg-white/10 rounded px-1">{it.shortcut}</kbd>}
          </span>
          {!!it.badge && <span className="absolute top-0 end-0 bg-red-500 text-white text-[10px] leading-none rounded-full min-w-[16px] min-h-[16px] flex items-center justify-center px-1">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}
