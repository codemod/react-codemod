var React = require('React');

export default React.createClass({
  render: function() {
    return React.findDOMNode(this);
  },
});
