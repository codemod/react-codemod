import * as R from 'react';

var Composer = R.createClass({
  componentWillReceiveProps: function() {
    this.getDOMNode();
    return foo(this.refs.input.getDOMNode());
  },
});
