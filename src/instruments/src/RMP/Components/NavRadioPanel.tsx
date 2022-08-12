import React, { useEffect, useState } from 'react';

import { StandbyFrequency, TransceiverType } from './StandbyFrequency';
import { StandbyCourse } from './StandbyCourse';
import { useSimVar } from '../../Common/simVars';
import { RadioPanelDisplay } from './RadioPanelDisplay';
import { useInteractionEvent } from '../../Common/hooks';

interface Props {
    /**
     * The RMP side (e.g. 'L' or 'R').
     */
    side: string,

    /**
     * The NAV transceiver  (VOR, ILS, ADF).
     */
    transceiver: number,

}

enum Mode {
    FREQUENCY = 0,
    COURSE = 1
}

/*
* Had to use this simvars to save the frequencies set via the RMP
* In real life, if you tune a navaid via the MCDU and then press NAV, the frequency is not the same
/

/**
 *
 * @param transceiver The transceiver type (VOR, ADF or ILS)
 * @param side Side on which the transceiver is (L or R)
 * @returns a tuble simvar
 */
const useActiveFrequency = (transceiver: number, side: string) => {
    switch (transceiver) {
    case TransceiverType.VOR:
        return useSimVar(`L:A32NX_RMP_${side}_SAVED_ACTIVE_FREQUENCY_VOR`, 'number');
    case TransceiverType.ADF:
        return useSimVar(`L:A32NX_RMP_${side}_SAVED_ACTIVE_FREQUENCY_ADF`, 'number');
    default:
        return useSimVar(`L:A32NX_RMP_${side}_SAVED_ACTIVE_FREQUENCY_ILS`, 'number');
    }
};

/**
 *
 * @param transceiver The transceiver type (VOR, ADF or ILS)
 * @param side Side on which the transceiver is (L or R)
 * @returns a tuble simvar
 */
const useStandbyFrequency = (transceiver: number, side: string) => {
    switch (transceiver) {
    case TransceiverType.VOR:
        return useSimVar(`L:A32NX_RMP_${side}_SAVED_STANDBY_FREQUENCY_VOR`, 'number');
    case TransceiverType.ADF:
        return useSimVar(`L:A32NX_RMP_${side}_SAVED_STANDBY_FREQUENCY_ADF`, 'number');
    default:
        return useSimVar(`L:A32NX_RMP_${side}_SAVED_STANDBY_FREQUENCY_ILS`, 'number');
    }
};

/**
 *
 * @param transceiver The transceiver type (VOR, ADF or ILS)
 * @param side Side on which the transceiver is (L or R)
 * @returns a tuble simvar
 */
const useCourse = (transceiver: number, side: string) => {
    switch (transceiver) {
    case TransceiverType.VOR:
        return useSimVar(`L:A32NX_RMP_${side}_SAVED_COURSE_VOR`, 'number');
    default:
        return useSimVar(`L:A32NX_RMP_${side}_SAVED_COURSE_ILS`, 'number');
    }
};

const setActiveFrequencySimVar = (transceiver: number, index: number, frequency: number) => {
    if (transceiver === TransceiverType.ADF) {
        SimVar.SetSimVarValue(`K:ADF${index === 1 ? '' : index}_ACTIVE_SET`, 'Frequency ADF BCD32', Avionics.Utils.make_adf_bcd32(frequency));
    }

    SimVar.SetSimVarValue(`K:NAV${index}_RADIO_SET_HZ`, 'Hz', frequency);
};

/**
 * NAV radio management panel React component.
 * Hooks into the mode active and standby frequency SimVars and wires transfer button.
 * Renders active frequency RadioPanelDisplay and appropriate StandbyFrequency sub-components.
 */
export const NavRadioPanel = (props: Props) => {
    let standbyWindow: JSX.Element;

    let index = props.side === 'L' ? 1 : 2;
    if (props.transceiver === TransceiverType.ILS) {
        index = 3; // Both RMPs manage the same ILS
    }

    const [mode, setMode] = useState(Mode.FREQUENCY);

    const [activeFrequency, setActiveFrequencySaved] = useActiveFrequency(props.transceiver, props.side);
    const [standbyFrequency, setStandbyFrequencySaved] = useStandbyFrequency(props.transceiver, props.side);
    const [course, setCourseSaved] = useCourse(props.transceiver, props.side);

    const [, setCourse] = useSimVar(props.transceiver === TransceiverType.VOR ? `K:VOR${index}_SET` : 'L:A32NX_FM_LS_COURSE', 'number', 100);

    useInteractionEvent(`A32NX_RMP_${props.side}_TRANSFER_BUTTON_PRESSED`, () => {
        if (mode === Mode.FREQUENCY) {
            if (props.transceiver !== TransceiverType.ADF) {
                setMode(Mode.COURSE);
            }

            // FCOM compliant: If ILS, the frequency can be tuned via the RMP only if both RMPs are in nav backup mode.
            if (props.transceiver !== TransceiverType.ILS
                || (SimVar.GetSimVarValue('L:A32NX_RMP_L_NAV_BUTTON_SELECTED', 'Bool') === true && SimVar.GetSimVarValue('L:A32NX_RMP_R_NAV_BUTTON_SELECTED', 'Bool') === true)) {
                setActiveFrequencySimVar(props.transceiver, index, standbyFrequency);
            }
            setActiveFrequencySaved(standbyFrequency);

            if (props.transceiver === TransceiverType.ILS) {
                SimVar.SetSimVarValue('L:A32NX_RMP_ILS_MLS_TUNED', 'boolean', true);
            }
        } else {
            setCourse(course);
            setMode(Mode.FREQUENCY);
        }
    });

    // This effect to display frequency mode instead of course mode when switching between receivers.
    // After few debug sessions, it was noticed standbyFrequency was the first valuable sign of switch.
    // I could have listened props.transceiver but this caused flickering (very fast display of previous frequency) due to sequential render
    useEffect(() => {
        // Performance purpose. Could set Frequency everytime but setMode fires a render
        if (mode === Mode.COURSE) {
            setMode(Mode.FREQUENCY);
        }
    }, [standbyFrequency]);

    if (mode === Mode.FREQUENCY) {
        standbyWindow = <StandbyFrequency side={props.side} value={standbyFrequency} setValue={setStandbyFrequencySaved} transceiver={props.transceiver} />;
    } else {
        standbyWindow = <StandbyCourse side={props.side} value={course} setValue={setCourseSaved} />;
    }

    return (
        <span>
            <RadioPanelDisplay value={activeFrequency} />
            {standbyWindow}
        </span>
    );
};
