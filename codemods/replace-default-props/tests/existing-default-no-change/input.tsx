const Button = ({ size = "12px" }) => {
  return <button style={{ fontSize: size }}>Click me</button>;
};

Button.defaultProps = {
  size: "16px",
};
