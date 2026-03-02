var React = require('react');

var MyComponent = React.createClass({
  mixins: [SomeOtherMixin],

  render: function() {
    return <div />;
  },
});

module.exports = MyComponent;
