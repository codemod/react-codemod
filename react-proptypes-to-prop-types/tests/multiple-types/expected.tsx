import PropTypes from "prop-types";
import React from "react";

function Button({ label, disabled }: { label: string; disabled?: boolean }) {
  return <button disabled={disabled}>{label}</button>;
}

Button.propTypes = {
  label: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
};

export default Button;
