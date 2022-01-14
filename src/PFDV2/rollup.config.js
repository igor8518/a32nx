'use strict';

import ts from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import scss from 'rollup-plugin-scss';

const { join } = require('path');

export default {
    input: join(__dirname, 'pfd/instrument.tsx'),
    output: {
        dir: '../../flybywire-aircraft-a320-neo/html_ui/Pages/VCockpit/Instruments/A32NX/PFD',
        format: 'es',
    },
    plugins: [scss(
        { output: '../../flybywire-aircraft-a320-neo/html_ui/Pages/VCockpit/Instruments/A32NX/PFD/pfd.css' },
    ),
    // typescript({ include: ['**/*.ts', '**/*.tsx', '../shared/src/*.ts', '../fmgc/src/**/ControlLaw.ts', '../failures/src/**/*.ts'] }), resolve()],
    resolve(), ts()],
};
