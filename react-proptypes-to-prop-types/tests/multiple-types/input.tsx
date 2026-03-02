import React from "react";

function Button({ label, disabled }: { label: string; disabled?: boolean }) {
  return <button disabled={disabled}>{label}</button>;
}

Button.propTypes = {
  label: React.PropTypes.string.isRequired,
  disabled: React.PropTypes.bool,
};

export default Button;
