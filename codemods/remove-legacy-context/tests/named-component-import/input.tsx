import PropTypes from "prop-types";
import { Component } from "react";

class Parent extends Component {
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
