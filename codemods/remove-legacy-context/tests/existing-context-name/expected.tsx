import PropTypes from "prop-types";
import React from "react";

const Context = makeSomething();

const Context2 = React.createContext();

class Parent extends React.Component {


  render() {
    return <Context2 value={{ foo: "bar" }}><Child /></Context2>;
  }
}
