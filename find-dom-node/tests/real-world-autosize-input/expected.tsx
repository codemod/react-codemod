import React from "react";

class AutosizeInput extends React.Component {
  componentDidMount() {
    const el = React.findDOMNode(this.refs.input);
    if (el && typeof el.focus === "function") {
      el.focus();
    }
    this.copyStyles();
  }

  copyStyles() {
    const node = React.findDOMNode(this);
    if (node && this.props.styles) {
      const target = node as HTMLElement;
      Object.assign(target.style, this.props.styles);
    }
  }

  render() {
    return <input ref="input" className="autosize-input" />;
  }
}

export default AutosizeInput;
