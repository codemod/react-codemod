import React from "react";

interface Props {
  onMeasure?: (node: Element | null) => void;
}

class NestedLayout extends React.Component<Props> {
  componentDidMount() {
    // Legacy pattern: nested refs for list inside a main container
    const listNode = this.refs.main.refs.list.getDOMNode();
    this.props.onMeasure?.(listNode as Element);
  }

  render() {
    return (
      <div ref="main">
        <div className="content">
          <ul ref="list">
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </div>
      </div>
    );
  }
}

export default NestedLayout;
