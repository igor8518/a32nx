import { NXDataStore } from '@shared/persistence';

type SimVar = [name: string, type: string, defaultValue: string];

function syncSetting(simVar: SimVar, propertyName: string) {
    NXDataStore.getAndSubscribe(propertyName, (prop, value) => {
        SimVar.SetSimVarValue(simVar[0], simVar[1], parseFloat(value)).catch((e) => console.log(propertyName, e));
    }, simVar[2]);
}

/**
 * This contains a list of NXDataStore settings that must be synced to simvars on plane load
 */
const settingsToSync: Map<string, SimVar> = new Map([
    ['SOUND_PTU_AUDIBLE_COCKPIT', ['L:A32NX_SOUND_PTU_AUDIBLE_COCKPIT', 'number', '0']],
    ['SOUND_EXTERIOR_MASTER', ['L:A32NX_SOUND_EXTERIOR_MASTER', 'number', '0']],
    ['SOUND_INTERIOR_ENGINE', ['L:A32NX_SOUND_INTERIOR_ENGINE', 'number', '0']],
    ['SOUND_INTERIOR_WIND', ['L:A32NX_SOUND_INTERIOR_WIND', 'number', '0']],
    ['EFB_BRIGHTNESS', ['L:A32NX_EFB_BRIGHTNESS', 'number', '0']],
    ['EFB_USING_AUTOBRIGHTNESS', ['L:A32NX_EFB_USING_AUTOBRIGHTNESS', 'bool', '0']],
    ['ISIS_BARO_UNIT_INHG', ['L:A32NX_ISIS_BARO_UNIT_INHG', 'number', '0']],
    ['REALISTIC_TILLER_ENABLED', ['L:A32NX_REALISTIC_TILLER_ENABLED', 'number', '0']],
    ['HOME_COCKPIT_ENABLED', ['L:A32NX_HOME_COCKPIT_ENABLED', 'number', '0']],
    ['SOUND_PASSENGER_AMBIENCE_ENABLED', ['L:A32NX_SOUND_PASSENGER_AMBIENCE_ENABLED', 'number', '1']],
    ['SOUND_ANNOUNCEMENTS_ENABLED', ['L:A32NX_SOUND_ANNOUNCEMENTS_ENABLED', 'number', '1']],
    ['SOUND_BOARDING_MUSIC_ENABLED', ['L:A32NX_SOUND_BOARDING_MUSIC_ENABLED', 'number', '1']],
    ['RADIO_RECEIVER_USAGE_ENABLED', ['L:A32NX_RADIO_RECEIVER_USAGE_ENABLED', 'number', '0']],
    ['MODEL_WHEELCHOCKS_ENABLED', ['L:A32NX_MODEL_WHEELCHOCKS_ENABLED', 'bool', '1']],
    ['MODEL_CONES_ENABLED', ['L:A32NX_MODEL_CONES_ENABLED', 'bool', '1']],
    ['FO_SYNC_EFIS_ENABLED', ['L:A32NX_FO_SYNC_EFIS_ENABLED', 'bool', '0']],
    ['MODEL_SATCOM_ENABLED', ['L:A32NX_SATCOM_ENABLED', 'bool', '0']],
    ['AUTO_DELETE_DISCONTINUITY', ['L:A32NX_AUTO_DELETE_DISCONTINUITY', 'number', '1']],
    ['AUTO_SID_STAR', ['L:A32NX_AUTO_SID_STAR', 'number', '1']],

    ['RUDDER_K', ['L:AI_RUDDER_K', 'float', '0']],
    ['RUDDER_P', ['L:AI_RUDDER_P', 'float', '0']],
    ['RUDDER_I', ['L:AI_RUDDER_I', 'float', '0']],
    ['RUDDER_D', ['L:AI_RUDDER_D', 'float', '0']],
    ['RUDDER_IB', ['L:AI_RUDDER_IB', 'float', '0']],
    ['RUDDER_ID', ['L:AI_RUDDER_ID', 'float', '0']],

    ['PITCH_K', ['L:AI_PITCH_K', 'float', '0']],
    ['PITCH_P', ['L:AI_PITCH_P', 'float', '0']],
    ['PITCH_I', ['L:AI_PITCH_I', 'float', '0']],
    ['PITCH_D', ['L:AI_PITCH_D', 'float', '0']],
    ['PITCH_IB', ['L:AI_PITCH_IB', 'float', '0']],
    ['PITCH_ID', ['L:AI_PITCH_ID', 'float', '0']],
]);

export function readSettingsFromPersistentStorage() {
    settingsToSync.forEach((simVar, propertyName) => syncSetting(simVar, propertyName));
}
