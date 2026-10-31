import React, { Component } from 'react';
import PT from 'prop-types';

class ClassComponent extends Component {
    static propTypes = {
        foo: PT.string.isRequired,
    }
}
