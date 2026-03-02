import R from "react";

class LegacyComponent extends R.Component {
  componentDidMount() {
    const el = R.findDOMNode(this);
    if (el) (el as HTMLElement).focus();
  }

  render() {
    return <div ref="root" />;
  }
}

export default LegacyComponent;
