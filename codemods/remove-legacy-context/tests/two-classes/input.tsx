import PropTypes from "prop-types";
import React from "react";

class Parent extends React.Component {
  static childContextTypes = { foo: PropTypes.string.isRequired };
  getChildContext() { return { foo: "bar" }; }
  render() { return <Child />; }
}

class Parent2 extends React.Component {
  static childContextTypes = { bar: PropTypes.string.isRequired };
  getChildContext() { return { bar: "baz" }; }
  render() { return <Child2 />; }
}
