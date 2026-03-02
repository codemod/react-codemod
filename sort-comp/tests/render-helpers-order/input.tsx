var React = require('react');

var CardList = React.createClass({
  renderHeader: function() {
    return <h2>Header</h2>;
  },

  renderCard: function(item) {
    return <div key={item.id}>{item.name}</div>;
  },

  propTypes: {
    items: React.PropTypes.array,
  },

  render: function() {
    return (
      <div>
        {this.renderHeader()}
        {this.props.items.map(this.renderCard)}
      </div>
    );
  },
});

module.exports = CardList;
