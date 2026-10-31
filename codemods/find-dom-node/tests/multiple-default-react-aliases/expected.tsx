import R from 'react';
import React from 'react';

var Composer = React.createClass({
  componentWillReceiveProps: function() {
    React.findDOMNode(this);
    return foo(React.findDOMNode(this.refs.input));
  },
});
