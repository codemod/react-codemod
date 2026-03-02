class ContactForm extends React.Component {
  handleSubmit = (e) => {
    e.preventDefault();
    this.props.onSubmit(this.state);
  }

  handleChange = (e) => {
    this.setState({ [e.target.name]: e.target.value });
  }

  render() {
    return (
      <form onSubmit={this.handleSubmit}>
        <input name="email" onChange={this.handleChange} />
        <input name="name" onChange={this.handleChange} />
        <button type="submit">Submit</button>
      </form>
    );
  }
}
