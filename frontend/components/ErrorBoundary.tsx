"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Something went wrong",
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("[ErrorBoundary]", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: null });
    window.location.href = "/auth";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest px-6">
          <div className="max-w-md w-full text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-error">error_outline</span>
            </div>
            <h1 className="text-lg font-semibold text-on-surface mb-2">
              The page hit an unexpected error
            </h1>
            <p className="text-sm text-on-surface-variant mb-6 break-words">
              {this.state.message ?? "Please try again."}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              Back to login
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
