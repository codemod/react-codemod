import React from "react";

class Component extends React.Component {
  handleClick = () => {
    const a = React.findDOMNode(this);
    const b = React.findDOMNode(this.refs.foo);
    a.classList.add("x");
    b.classList.add("y");
  };
  render() {
    return <div ref="foo" />;
  }
}
