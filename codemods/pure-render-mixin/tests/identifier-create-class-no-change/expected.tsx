var React = require('react/addons');
var PureRenderMixin = React.addons.PureRenderMixin;
var createClass = require('create-react-class');

var C = createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <div />;
  },
});
