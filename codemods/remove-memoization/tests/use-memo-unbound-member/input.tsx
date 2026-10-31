import { useMemo } from 'react';

const fromMember = useMemo(obj.compute, []);
const fromNestedMember = useMemo(helpers.obj.compute, []);
const fromParenMember = useMemo((obj.compute), []);
