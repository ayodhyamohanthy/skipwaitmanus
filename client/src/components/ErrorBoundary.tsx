import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureClientError } from "@/lib/sentry";
import { ErrorScreen, needsReload } from "@/components/app-states/SystemStates";
// Relative on purpose: the goal fallback lives with the goal primitives (D-048-F-app-wrapper).
import { GoalErrorFallback } from "./goal/wrapper/GoalErrorFallback";
import { goalWrapperOnPath } from "./goal/wrapper/routeSurface";

/**
 * Error fallback switch for both boundaries: the goal fallback where the current route's goal surface is on,
 * otherwise the legacy screen passed in. Read at render time, since a boundary may sit outside the router.
 */
export function ErrorFallbackSwitch({ screen, onRetry, legacy }: { screen: string; onRetry: () => void; legacy: ReactNode }) {
  if (typeof window !== "undefined" && goalWrapperOnPath(window.location.pathname)) return <GoalErrorFallback screen={screen} onRetry={onRetry} />;
  return <>{legacy}</>;
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** App-wide last resort. Renders the goal or kit error screen; Try again resets the boundary. */
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
    if (this.state.error) return <ErrorFallbackSwitch screen="app-error" onRetry={this.retry} legacy={<ErrorScreen screen="app-error" onRetry={this.retry} />} />;
    return this.props.children;
  }
}

export default ErrorBoundary;
