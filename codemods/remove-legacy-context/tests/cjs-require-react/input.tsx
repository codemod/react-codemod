const PropTypes = require("prop-types");
const React = require("react");

class Parent extends React.Component {
  static childContextTypes = {
    foo: PropTypes.string.isRequired,
  };

  getChildContext() {
    return { foo: "bar" };
  }

  render() {
    return <Child />;
  }
}
