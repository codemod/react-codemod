import PropTypes from "prop-types";
import { Component } from "react";
import * as React from "react";

const Context = React.createContext();

class Parent extends Component {


  render() {
    return <Context value={{ foo: "bar" }}><Child /></Context>;
  }
}
