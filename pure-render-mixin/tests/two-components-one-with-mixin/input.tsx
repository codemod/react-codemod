var React = require('react/addons');
var PureRenderMixin = React.addons.PureRenderMixin;

var PlainComponent = React.createClass({
  render: function() {
    return <div>Plain</div>;
  },
});

var OptimizedComponent = React.createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <div>Optimized</div>;
  },
});

module.exports = { PlainComponent, OptimizedComponent };
