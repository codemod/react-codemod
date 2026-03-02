import React from "react";

class Component extends React.Component {
  handleClick = () => {
    const a = this.getDOMNode();
    const b = this.refs.foo.getDOMNode();
    a.classList.add("x");
    b.classList.add("y");
  };
  render() {
    return <div ref="foo" />;
  }
}
