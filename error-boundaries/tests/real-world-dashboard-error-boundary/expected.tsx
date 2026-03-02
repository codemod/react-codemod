import React from "react";

export class DashboardErrorBoundary extends React.Component {
  state = { hasError: false };

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ hasError: true });
    logErrorToService(error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <div className="dashboard-error">Something went wrong.</div>;
    }
    return this.props.children;
  }
}

function logErrorToService(_err: Error, _stack?: string) {}
