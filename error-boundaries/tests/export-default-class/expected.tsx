import React from "react";

export default class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  componentDidCatch(error, errorInfo) {
    this.setState({ hasError: true });
  }

  render() {
    return this.props.children;
  }
}
