var React = require('react/addons');
var createClass = React.createClass;

var Sidebar = createClass({
  
  shouldComponentUpdate: function(nextProps, nextState) {

    return React.addons.shallowCompare(this, nextProps, nextState);

  },

  render: function() {
    return <aside>Sidebar</aside>;
  },
});

module.exports = Sidebar;
