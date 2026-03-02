var React = require('react');

var LifecycleDemo = React.createClass({
  render: function() {
    return <div />;
  },

  componentDidMount: function() {
    console.log('mounted');
  },

  componentWillUnmount: function() {
    console.log('unmounting');
  },

  componentWillMount: function() {
    console.log('will mount');
  },

  getInitialState: function() {
    return {};
  },
});

module.exports = LifecycleDemo;
