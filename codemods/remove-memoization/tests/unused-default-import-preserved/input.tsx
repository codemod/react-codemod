import React from 'react';
import { useMemo, useState } from 'react';

const [state] = useState(0);
const value = useMemo(() => state, [state]);
