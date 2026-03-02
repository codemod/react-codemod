import React from "react";

class Boundary extends React.Component {
  unstable_handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    this.setState({ error });
  };

  render() {
    return this.props.children;
  }
}
