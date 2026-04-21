const React = require('react');

class Hello extends React.Component {
  render() {
    return React.DOM.p(null, React.DOM.a({ href: '#hello' }, this.props.children));
  }
}
