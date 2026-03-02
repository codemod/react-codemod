var React = require('react');

var LifecycleDemo = React.createClass({
  getInitialState: function() {
    return {};
  },

  componentWillMount: function() {
    console.log('will mount');
  },

  componentDidMount: function() {
    console.log('mounted');
  },

  componentWillUnmount: function() {
    console.log('unmounting');
  },

  render: function() {
    return <div />;
  },
});

module.exports = LifecycleDemo;
