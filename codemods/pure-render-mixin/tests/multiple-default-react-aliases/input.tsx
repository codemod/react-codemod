import R from 'react/addons';
import React from 'react/addons';

var PureRenderMixin = React.addons.PureRenderMixin;

var MyComponent = React.createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <div />;
  },
});
