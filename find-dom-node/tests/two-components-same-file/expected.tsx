import React from "react";

class Modal extends React.Component {
  componentDidMount() {
    const node = React.findDOMNode(this);
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
    const tipNode = React.findDOMNode(this.refs.tip);
    const target = this.props.targetRef;
    // ... positioning logic using tipNode
    return tipNode;
  }

  render() {
    return <div ref="tip" className="tooltip" />;
  }
}

export { Modal, Tooltip };
