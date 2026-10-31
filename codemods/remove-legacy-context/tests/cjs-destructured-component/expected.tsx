const PropTypes = require('prop-types');
const { Component } = require('react');
const React = require('react');

const Context = React.createContext();

class Parent extends Component {


  render() {
    return <Context value={{ foo: 'bar' }}><Child /></Context>;
  }
}

module.exports = Parent;
