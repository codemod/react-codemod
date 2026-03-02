var React = require('react/addons');
var PureRenderMixin = React.addons.PureRenderMixin;
var createClass = React.createClass;

var Sidebar = createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <aside>Sidebar</aside>;
  },
});

module.exports = Sidebar;
