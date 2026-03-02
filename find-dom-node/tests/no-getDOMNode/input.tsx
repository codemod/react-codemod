import React from "react";

class Component extends React.Component {
  componentDidMount() {
    this.refs.div.focus();
  }
  render() {
    return <div ref="div" />;
  }
}
