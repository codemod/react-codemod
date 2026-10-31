import * as R from 'react/addons';

var PureRenderMixin = R.addons.PureRenderMixin;

var MyComponent = R.createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <div />;
  },
});
