class Pagination extends React.Component {
  constructor(props) {
    super(props);
    this.onPageChange = this.onPageChange.bind(this);
  }

  onPageChange(page) {
    this.props.onChange(page);
  }

  render() {
    return (
      <div>
        <button onClick={this.onPageChange}>Next</button>
      </div>
    );
  }
}
