class Pagination extends React.Component {
  onPageChange = (page) => {
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
