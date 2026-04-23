import PropTypes from "prop-types";
import React from "react";

const Context = React.createContext();

class Parent extends React.Component {
  render() { return <Context value={{ foo: "bar" }}><Child /></Context>; }
}

const Context2 = React.createContext();

class Parent2 extends React.Component {
  render() { return <Context2 value={{ bar: "baz" }}><Child2 /></Context2>; }
}
