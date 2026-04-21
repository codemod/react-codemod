var PureRenderMixin = React.addons.PureRenderMixin;

var C = React.createClass({
  mixins: [PureRenderMixin],

  render: function() {
    return <div />;
  },
});
