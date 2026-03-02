import React from "react";

class ErrorBoundary extends React.Component {
  unstable_handleError(error) {
    logError(error);
  }
  render() {
    return this.props.children;
  }
}

export default ErrorBoundary;
