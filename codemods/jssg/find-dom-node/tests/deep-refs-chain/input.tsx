var React = require('React');
var C = React.createClass({
  render: function() {
    return this.refs.main.refs.list.getDOMNode();
  }
});
