import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Without this a thrown render error blanks the
 * whole PWA to a white screen with no way out. Here it shows a recovery
 * screen — the user's data is local in IndexedDB and untouched, so a
 * reload almost always clears a transient error.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          The app hit an unexpected error. Your diary data is safe on this
          device — reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="tap-target rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Reload
        </button>
        <pre className="max-w-xs overflow-x-auto rounded-md bg-muted p-2 text-left text-[11px] text-muted-foreground">
          {this.state.error.message}
        </pre>
      </div>
    );
  }
}
