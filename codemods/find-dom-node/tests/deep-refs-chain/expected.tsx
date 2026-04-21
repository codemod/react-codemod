var React = require('React');
var C = React.createClass({
  render: function() {
    return React.findDOMNode(this.refs.main.refs.list);
  }
});
