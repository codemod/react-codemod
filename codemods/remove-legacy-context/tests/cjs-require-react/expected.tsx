const PropTypes = require("prop-types");
const React = require("react");

const Context = React.createContext();

class Parent extends React.Component {


  render() {
    return <Context value={{ foo: "bar" }}><Child /></Context>;
  }
}
