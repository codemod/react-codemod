import React from "react";

class Modal extends React.Component {
  componentDidMount() {
    const node = this.getDOMNode();
    if (node) {
      (node as HTMLElement).setAttribute("aria-hidden", "false");
    }
  }

  render() {
    return <div className="modal" role="dialog">{this.props.children}</div>;
  }
}

class Tooltip extends React.Component<{ targetRef?: React.ReactInstance }> {
  position() {
    const tipNode = this.refs.tip.getDOMNode();
    const target = this.props.targetRef;
    // ... positioning logic using tipNode
    return tipNode;
  }

  render() {
    return <div ref="tip" className="tooltip" />;
  }
}

export { Modal, Tooltip };
