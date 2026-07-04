import { Component } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

// Catches any render-time crash in whatever page is currently mounted and shows a
// recoverable message instead of a blank white screen. This is a safety net, not a
// fix for the underlying bug — if this is showing up, something upstream threw and
// should still be tracked down — but the user should never be stuck looking at a
// blank page with no way forward.
export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Page crashed:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-20 px-6">
          <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950 text-red-500 flex items-center justify-center mb-4">
            <AlertTriangle size={26} />
          </div>
          <h2 className="font-bold text-lg text-navy-900 dark:text-white mb-1">This page hit a problem</h2>
          <p className="text-sm text-slate-500 max-w-sm mb-5">
            Something went wrong loading this page. Reloading usually fixes it — if it keeps happening on this
            same page, let support know what page you were on.
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary">
            <RotateCw size={16} /> Reload page
          </button>
          <details className="mt-6 text-xs text-slate-400 max-w-lg text-left">
            <summary className="cursor-pointer select-none">Technical details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{String(this.state.error?.message || this.state.error)}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
