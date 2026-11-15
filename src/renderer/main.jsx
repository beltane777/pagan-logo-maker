/**
 * @file src/renderer/main.jsx
 * @description Renderer entry point. Mounts the React shell and installs a
 * minimal error boundary so a panel-level exception can never blank the whole
 * studio.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

/**
 * Top-level error boundary — shows a recoverable message instead of a white
 * screen, which matters for a packaged desktop app with no devtools.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[renderer] unhandled error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md rounded-xl border border-blood-500/40 bg-void-800 p-6 text-center">
            <h1 className="font-display text-lg text-parchment mb-2">Something broke</h1>
            <p className="text-[11px] text-neutral-500 leading-relaxed mb-4">
              The studio hit an unexpected error. Your saved projects are untouched.
            </p>
            <pre className="max-h-40 overflow-auto rounded bg-void-900 p-3 text-left text-[10px] text-blood-500/90">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-gold mt-4"
            >
              Reload studio
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
