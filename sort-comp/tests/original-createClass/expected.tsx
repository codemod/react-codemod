var React = require('react/addons');

// comment above createClass
var MyComponent = React.createClass({
  // comment at top of createClass
  // this will be attached to first method

  propTypes: {
    foo: bar, // comment on prop
  },

  mixins: [PureRenderMixin],

  componentDidMount() {
  },

  myOwnMethod(foo) {
    // comment within method
  },

  renderBar() {
    // should come before renderFoo
  },

  renderFoo() {
    // other render* function
  },

  render: function() {
    return <div />;
  },

});

/* comment at end */
module.exports = MyComponent;
