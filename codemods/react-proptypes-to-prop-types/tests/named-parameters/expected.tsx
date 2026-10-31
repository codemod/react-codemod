import React from 'react';
import classnames from 'classnames';
import PropTypes from 'prop-types';

const propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
};

const Accordion = ({ children, className }) => {
  const classNames = classnames('bx--accordion', className);
  return (
    <ul className={classNames}>
      {children}
    </ul>
  );
};

Accordion.propTypes = propTypes;

export default Accordion;