import R from 'react/addons';
import React from 'react/addons';

var MyComponent = React.createClass({
  shouldComponentUpdate: function(nextProps, nextState) {
    return React.addons.shallowCompare(this, nextProps, nextState);
  },

  render: function() {
    return <div />;
  },
});
