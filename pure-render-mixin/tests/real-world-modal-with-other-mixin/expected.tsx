var React = require('react/addons');
var EventListenerMixin = require('react-event-listener-mixin');

var Modal = React.createClass({
  mixins: [EventListenerMixin],

  componentDidMount: function() {
    this.addEventListener(document, 'keydown', this.handleKeyDown);
  },

  componentWillUnmount: function() {
    this.removeEventListener(document, 'keydown', this.handleKeyDown);
  },

  handleKeyDown: function(e) {
    if (e.key === 'Escape') this.props.onClose();
  },

  
  shouldComponentUpdate: function(nextProps, nextState) {

    return React.addons.shallowCompare(this, nextProps, nextState);

  },

  render: function() {
    return (
      <div className="modal-backdrop" onClick={this.props.onClose}>
        <div className="modal" onClick={function(e) { e.stopPropagation(); }}>
          {this.props.children}
        </div>
      </div>
    );
  },
});

module.exports = Modal;
