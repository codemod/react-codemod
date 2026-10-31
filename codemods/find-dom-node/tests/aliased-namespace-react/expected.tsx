import * as R from 'react';

var Composer = R.createClass({
  componentWillReceiveProps: function() {
    R.findDOMNode(this);
    return foo(R.findDOMNode(this.refs.input));
  },
});
