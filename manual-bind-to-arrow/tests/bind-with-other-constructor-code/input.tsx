class DataTable extends React.Component {
  constructor(props) {
    super(props);
    this.state = { sortKey: null };
    this.handleSort = this.handleSort.bind(this);
  }

  handleSort(column) {
    this.setState({ sortKey: column });
  }

  render() {
    return <table onClick={this.handleSort} />;
  }
}
