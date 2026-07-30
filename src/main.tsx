import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Note: vite-plugin-pwa's `registerType: 'autoUpdate'` already wires up SW
// registration + update-on-next-navigation. We previously added a manual
// `registerSW({immediate, onNeedRefresh: reload})` block on top of that, but
// the explicit reload caused a reload-loop on slow networks. Let the plugin
// handle it; the user's next navigation picks up the new bundle naturally.

class RootBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override componentDidCatch(error: Error, info: ErrorInfo) { console.error('[boundary]', error, info?.componentStack); }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen p-6">
        <h1 className="text-base font-bold text-clay">Something went wrong</h1>
        <pre className="mt-3 whitespace-pre-wrap break-words bg-line rounded-xl p-3 text-xs">
          {String(this.state.error?.message ?? this.state.error)}
          {this.state.error?.stack ? '\n\n' + this.state.error.stack : ''}
        </pre>
        <button className="mt-4 rounded-xl bg-forest text-paper px-4 py-2 font-bold"
                onClick={() => { localStorage.clear(); window.location.reload(); }}>
          Sign out and reload
        </button>
      </div>
    );
  }
}

window.addEventListener('unhandledrejection', (e) => console.error('[unhandled]', e.reason));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootBoundary>
      <App />
    </RootBoundary>
  </StrictMode>,
);
