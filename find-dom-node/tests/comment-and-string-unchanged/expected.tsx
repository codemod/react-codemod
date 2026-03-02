import React from "react";

// Migrate getDOMNode() to React.findDOMNode() when you run the codemod.
const LEGACY_API = "getDOMNode";

class Component extends React.Component {
  componentDidMount() {
    // We use this.refs.div for something else, no getDOMNode here
    this.refs.div.classList.add("mounted");
  }

  render() {
    return <div ref="div" />;
  }
}

export default Component;
