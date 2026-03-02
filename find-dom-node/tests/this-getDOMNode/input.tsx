import React from "react";

class MyComponent extends React.Component {
  componentDidMount() {
    const node = this.getDOMNode();
    node.focus();
  }
  render() {
    return <div ref="el" />;
  }
}
