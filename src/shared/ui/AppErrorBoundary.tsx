import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
  label?: string;
  resetKey?: string | number | null;
  compact?: boolean;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

function isChunkLoadError(error: Error) {
  return /chunkloaderror|loading chunk|failed to fetch dynamically imported module|importing a module script failed|dynamically imported module/i.test(
    `${error.name} ${error.message}`
  );
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App surface crashed.", {
      label: this.props.label,
      error,
      componentStack: info.componentStack
    });
  }

  componentDidUpdate(previousProps: AppErrorBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const label = this.props.label ?? "This surface";
    const isVersionMismatch = isChunkLoadError(error);

    return (
      <div
        role="alert"
        className={`border-y border-[#111111] bg-white text-[#111111] ${
          this.props.compact ? "px-4 py-4" : "px-6 py-6"
        }`}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a04436]">
          {isVersionMismatch ? "New version available" : "Safe mode"}
        </div>
        <div className="mt-2 font-serif text-[22px] font-semibold leading-tight tracking-[-0.035em]">
          {isVersionMismatch ? "Refresh to load the latest workspace." : `${label} could not render.`}
        </div>
        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#595959]">
          {isVersionMismatch
            ? "A deploy likely changed the app files while this browser tab was open. Refreshing will pull the current version."
            : "The rest of the workspace is still available. Try opening another surface, rerun the question, or refresh if this keeps happening."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (isVersionMismatch) {
                window.location.reload();
                return;
              }
              this.setState({ error: null });
            }}
            className="border border-[#111111] bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:border-[#0f8b73] hover:bg-[#0f8b73]"
          >
            {isVersionMismatch ? "Refresh now" : "Try again"}
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/home")}
            className="border border-[#d9d9d9] bg-white px-4 py-2 text-[12px] font-semibold text-[#333333] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
          >
            Back home
          </button>
        </div>
      </div>
    );
  }
}
