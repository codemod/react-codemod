var React = require('react/addons');
var PlainComponent = React.createClass({
  render: function() {
    return <div>Plain</div>;
  },
});

var OptimizedComponent = React.createClass({
  
  shouldComponentUpdate: function(nextProps, nextState) {

    return React.addons.shallowCompare(this, nextProps, nextState);

  },

  render: function() {
    return <div>Optimized</div>;
  },
});

module.exports = { PlainComponent, OptimizedComponent };
