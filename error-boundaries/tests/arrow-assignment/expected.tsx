import React from "react";

class Boundary extends React.Component {
  componentDidCatch = (error: Error, errorInfo: React.ErrorInfo) => {
    this.setState({ error });
  };

  render() {
    return this.props.children;
  }
}
