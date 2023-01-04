import React from 'react';
import { DisplayUnit } from '@instruments/common/displayUnit';
import { render } from '../Common';
import UpperDisplay from './elements/UpperDisplay';
import LowerDisplay from './elements/LowerDisplay';

import './style.scss';

export const EWD: React.FC = () => (
    <DisplayUnit
        electricitySimvar="L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED"
        potentiometerIndex={93}
    >
        <svg className="ewd-svg" version="1.1" viewBox="0 0 768 768" xmlns="http://www.w3.org/2000/svg">
            <UpperDisplay />
            <LowerDisplay />
        </svg>
    </DisplayUnit>
);

render(<EWD />);
