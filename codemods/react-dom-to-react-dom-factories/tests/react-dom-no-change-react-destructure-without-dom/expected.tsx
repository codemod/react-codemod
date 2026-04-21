const React = require('react');
const { Component } = React;

class Hello extends Component {
  render() {
    return DOM.div(null, `Hello ${this.props.toWhat}`);
  }
}
