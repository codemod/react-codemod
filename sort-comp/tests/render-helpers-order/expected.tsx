var React = require('react');

var CardList = React.createClass({
  propTypes: {
    items: React.PropTypes.array,
  },

  renderCard: function(item) {
    return <div key={item.id}>{item.name}</div>;
  },

  renderHeader: function() {
    return <h2>Header</h2>;
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
