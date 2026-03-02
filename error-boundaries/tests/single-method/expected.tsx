import React from "react";

class ErrorBoundary extends React.Component {
  componentDidCatch(error) {
    logError(error);
  }
  render() {
    return this.props.children;
  }
}

export default ErrorBoundary;
