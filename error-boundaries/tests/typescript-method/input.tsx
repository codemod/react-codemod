import React from "react";

interface Props {
  children: React.ReactNode;
}

export class TypedErrorBoundary extends React.Component<Props> {
  unstable_handleError(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(error, errorInfo);
  }

  render() {
    return this.props.children;
  }
}
