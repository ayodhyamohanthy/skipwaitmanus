import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { captureClientError } from "@/lib/sentry";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    captureClientError(error, { boundary: "ErrorBoundary", componentStack: info.componentStack?.slice(0, 2000) });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-white px-5 py-5 text-black">
          <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#b91c1c]/10 text-[#B91C1C]">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-.02em]">Something went wrong.</h1>
            <div role="alert" className="mt-3 w-full rounded-xl border border-[#b91c1c]/30 bg-[#b91c1c]/10 p-4 text-sm leading-6 text-muted-foreground">
              The page ran into an unexpected error. Nothing was sent or changed — you can reload to try again.
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white"
            >
              <RotateCcw className="h-4 w-4" />
              Reload page
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
