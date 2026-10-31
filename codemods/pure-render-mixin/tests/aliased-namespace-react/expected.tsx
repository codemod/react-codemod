import * as R from 'react/addons';

var MyComponent = R.createClass({
  shouldComponentUpdate: function(nextProps, nextState) {
    return R.addons.shallowCompare(this, nextProps, nextState);
  },

  render: function() {
    return <div />;
  },
});
