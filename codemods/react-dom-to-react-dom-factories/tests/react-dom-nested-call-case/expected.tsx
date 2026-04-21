const React = require('react');

class Hello extends React.Component {
  render() {
    return React.createElement(
      'p',
      null,
      React.createElement('a', { href: '#hello' }, this.props.children)
    );
  }
}
