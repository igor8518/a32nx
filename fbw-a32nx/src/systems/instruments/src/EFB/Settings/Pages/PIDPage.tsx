import React from 'react';
import { usePersistentFloatProperty, useSimVar } from '@flybywiresim/fbw-sdk';

import { t } from '../../translation';
import { SettingGroup, SettingItem, SettingsPage } from '../Settings';

import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';

export const PIDPage = () => {
    const [angleFront] = useSimVar('L:AI_ANGLE_FRONT', 'float');
    const [noseFront] = useSimVar('L:AI_NOSE_FRONT', 'float');

    const [rudderK, setRudderK] = usePersistentFloatProperty('RUDDER_K', 16383.0);
    const [rudderP, setRudderP] = usePersistentFloatProperty('RUDDER_P', 0.055);
    const [rudderI, setRudderI] = usePersistentFloatProperty('RUDDER_I', 0.002);
    const [rudderD, setRudderD] = usePersistentFloatProperty('RUDDER_D', 0.1);
    const [rudderIB, setRudderIB] = usePersistentFloatProperty('RUDDER_IB', 1.0);
    const [rudderID, setRudderID] = usePersistentFloatProperty('RUDDER_ID', 1.0);

    const [pitchK, setPitchK] = usePersistentFloatProperty('PITCH_K', 1.0);
    const [pitchP, setPitchP] = usePersistentFloatProperty('PITCH_P', 1000.0);
    const [pitchI, setPitchI] = usePersistentFloatProperty('PITCH_I', 0.1);
    const [pitchD, setPitchD] = usePersistentFloatProperty('PITCH_D', 5.0);
    const [pitchIB, setPitchIB] = usePersistentFloatProperty('PITCH_IB', 100.0);
    const [pitchID, setPitchID] = usePersistentFloatProperty('PITCH_ID', 100.0);

    return (
        <SettingsPage name={t('PID')}>
            <SettingGroup>
                <SettingItem name={t('Angle head')}>
                    <SimpleInput
                        value={angleFront}
                        className="w-20 text-center"
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Nose head')}>
                    <SimpleInput
                        value={noseFront}
                        className="w-20 text-center"
                        number
                    />
                </SettingItem>
            </SettingGroup>
            <SettingGroup>
                <SettingItem name={t('Rudder K')}>
                    <SimpleInput
                        value={rudderK}
                        className="w-20 text-center"
                        onChange={(value) => setRudderK(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Rudder P')}>
                    <SimpleInput
                        value={rudderP}
                        className="w-20 text-center"
                        onChange={(value) => setRudderP(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Rudder I')}>
                    <SimpleInput
                        value={rudderI}
                        className="w-20 text-center"
                        onChange={(value) => setRudderI(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Rudder D')}>
                    <SimpleInput
                        value={rudderD}
                        className="w-20 text-center"
                        onChange={(value) => setRudderD(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Rudder IB')}>
                    <SimpleInput
                        value={rudderIB}
                        className="w-20 text-center"
                        onChange={(value) => setRudderIB(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Rudder ID')}>
                    <SimpleInput
                        value={rudderID}
                        className="w-20 text-center"
                        onChange={(value) => setRudderID(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
            </SettingGroup>
            <SettingGroup>
                <SettingItem name={t('Pitch K')}>
                    <SimpleInput
                        value={pitchK}
                        className="w-20 text-center"
                        onChange={(value) => setPitchK(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Pitch P')}>
                    <SimpleInput
                        value={pitchP}
                        className="w-20 text-center"
                        onChange={(value) => setPitchP(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Pitch I')}>
                    <SimpleInput
                        value={pitchI}
                        className="w-20 text-center"
                        onChange={(value) => setPitchI(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Pitch D')}>
                    <SimpleInput
                        value={pitchD}
                        className="w-20 text-center"
                        onChange={(value) => setPitchD(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Pitch IB')}>
                    <SimpleInput
                        value={pitchIB}
                        className="w-20 text-center"
                        onChange={(value) => setPitchIB(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
                <SettingItem name={t('Pitch ID')}>
                    <SimpleInput
                        value={pitchID}
                        className="w-20 text-center"
                        onChange={(value) => setPitchID(Number.parseFloat(value))}
                        number
                    />
                </SettingItem>
            </SettingGroup>
        </SettingsPage>
    );
};
