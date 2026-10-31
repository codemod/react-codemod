import R from 'react';
import React from 'react';

var Composer = React.createClass({
  componentWillReceiveProps: function() {
    this.getDOMNode();
    return foo(this.refs.input.getDOMNode());
  },
});
