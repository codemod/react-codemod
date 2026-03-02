import React from "react";

class MyComponent extends React.Component {
  componentDidMount() {
    const node = React.findDOMNode(this);
    node.focus();
  }
  render() {
    return <div ref="el" />;
  }
}
