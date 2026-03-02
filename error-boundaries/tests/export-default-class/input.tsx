import React from "react";

export default class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  unstable_handleError(error, errorInfo) {
    this.setState({ hasError: true });
  }

  render() {
    return this.props.children;
  }
}
