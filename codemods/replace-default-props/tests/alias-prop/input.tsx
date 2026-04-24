const Button = ({ color: shade }) => {
  return <button style={{ color: shade }}>Click me</button>;
};

Button.defaultProps = {
  color: "blue",
};
