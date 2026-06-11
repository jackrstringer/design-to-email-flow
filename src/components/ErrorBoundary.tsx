import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defense: a crash anywhere in the tree renders a recoverable
 * error surface instead of a silent white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-[14px] border bg-card p-6 text-center">
            <p className="text-base font-semibold tracking-tight">Something broke</p>
            <p className="mt-2 text-sm text-muted-foreground">
              The app hit an unexpected error. Reloading usually fixes it — if it
              keeps happening, flag it from the Knowledge tab so Sendr learns.
            </p>
            <p className="mt-3 rounded-lg bg-secondary p-2 font-mono text-xs text-muted-foreground">
              {this.state.error.message}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={() => window.location.reload()}>Reload</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  window.location.assign('/queue');
                }}
              >
                Back to queue
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
