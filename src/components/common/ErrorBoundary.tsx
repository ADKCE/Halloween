import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { reportClientError } from '../../utils/errorLogger';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  tabName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error in', this.props.tabName || 'App', error, errorInfo);

    // Unbehandelten Fehler automatisch in client_errors loggen
    reportClientError({
      message: error.message || 'Unbekannter React-Fehler',
      stack: error.stack || errorInfo.componentStack || undefined,
      source: `React ErrorBoundary (${this.props.tabName || 'root'})`,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 rounded-3xl bg-zinc-950/90 border-2 border-rose-500/70 text-zinc-100 shadow-2xl text-center space-y-4 animate-in fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/80 border border-rose-500/50 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-7 h-7 animate-pulse" />
          </div>

          <div className="space-y-1">
            <h3 className="font-serif font-black text-lg text-white">
              {this.props.fallbackTitle || 'Ein Anzeigefehler ist aufgetreten'}
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
              Dieser Bereich konnte nicht geladen werden. Der Rest des Spiels und die Admin-Zentrale bleiben geschützt.
            </p>
          </div>

          {this.state.error && (
            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-left font-mono text-[10px] text-rose-300 break-words max-h-32 overflow-y-auto">
              {this.state.error.message}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-xs font-bold text-zinc-300 transition cursor-pointer"
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-xs font-black text-white shadow-lg shadow-rose-950/60 flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Seite neu laden
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
