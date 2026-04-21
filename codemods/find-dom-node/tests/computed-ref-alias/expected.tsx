var React = require('React');
var C = React.createClass({
  render: function() {
    var ref = 'foo';
    var thing = this.refs[ref];
    return React.findDOMNode(thing);
  }
});
