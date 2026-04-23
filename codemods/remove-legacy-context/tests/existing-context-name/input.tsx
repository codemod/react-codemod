import PropTypes from "prop-types";
import React from "react";

const Context = makeSomething();

class Parent extends React.Component {
  static childContextTypes = { foo: PropTypes.string.isRequired };

  getChildContext() {
    return { foo: "bar" };
  }

  render() {
    return <Child />;
  }
}
