const PropTypes = require('prop-types');
const { Component } = require('react');

class Parent extends Component {
  static childContextTypes = {
    foo: PropTypes.string.isRequired,
  };

  getChildContext() {
    return { foo: 'bar' };
  }

  render() {
    return <Child />;
  }
}

module.exports = Parent;
