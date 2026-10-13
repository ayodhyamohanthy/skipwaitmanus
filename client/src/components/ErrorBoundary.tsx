import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureClientError } from "@/lib/sentry";
import { ErrorScreen, needsReload } from "@/components/app-states/SystemStates";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** App-wide last resort. Renders the kit error screen; Try again resets the boundary. */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureClientError(error, { boundary: "ErrorBoundary", componentStack: info.componentStack?.slice(0, 2000) });
  }

  private retry = () => {
    if (needsReload(this.state.error)) window.location.reload();
    else this.setState({ error: null });
  };

  render() {
    if (this.state.error) return <ErrorScreen screen="app-error" onRetry={this.retry} />;
    return this.props.children;
  }
}

export default ErrorBoundary;
