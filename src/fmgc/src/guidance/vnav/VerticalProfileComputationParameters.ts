import { Fmgc } from '@fmgc/guidance/GuidanceController';
import { SpeedLimit } from '@fmgc/guidance/vnav/SpeedLimit';
import { LateralMode, VerticalMode } from '@shared/autopilot';

export interface VerticalProfileComputationParameters {
    presentPosition: LatLongAlt,

    fcuAltitude: Feet,
    fcuVerticalMode: VerticalMode,
    fcuLateralMode: LateralMode,

    zeroFuelWeight: number, // pounds
    fuelOnBoard: number, // pounds
    v2Speed: Knots,
    tropoPause: Feet,
    managedClimbSpeed: Knots,
    perfFactor: number,
    originAirfieldElevation: Feet,
    accelerationAltitude: Feet,
    thrustReductionAltitude: Feet,
    cruiseAltitude: Feet,
    speedLimit: SpeedLimit,
}

export class VerticalProfileComputationParametersObserver {
    private parameters: VerticalProfileComputationParameters;

    constructor(private fmgc: Fmgc) {
        this.update();
    }

    update() {
        this.parameters = {
            presentPosition: this.getPresentPosition(),

            fcuAltitude: Simplane.getAutoPilotDisplayedAltitudeLockValue(),
            fcuVerticalMode: SimVar.GetSimVarValue('L:A32NX_FMA_VERTICAL_MODE', 'Enum'),
            fcuLateralMode: SimVar.GetSimVarValue('L:A32NX_FMA_LATERAL_MODE', 'Enum'),

            zeroFuelWeight: this.fmgc.getZeroFuelWeight(),
            fuelOnBoard: this.fmgc.getFOB(),
            v2Speed: this.fmgc.getV2Speed(),
            tropoPause: this.fmgc.getTropoPause(),
            managedClimbSpeed: this.fmgc.getManagedClimbSpeed(),
            perfFactor: 0, // FIXME: Use actual value,
            originAirfieldElevation: SimVar.GetSimVarValue('L:A32NX_DEPARTURE_ELEVATION', 'feet'),
            accelerationAltitude: this.fmgc.getAccelerationAltitude(),
            thrustReductionAltitude: this.fmgc.getThrustReductionAltitude(),
            cruiseAltitude: this.fmgc.getCruiseAltitude(),
            speedLimit: {
                underAltitude: 10000,
                speed: 250,
            },
        };
    }

    private getPresentPosition(): LatLongAlt {
        return new LatLongAlt(
            SimVar.GetSimVarValue('PLANE LATITUDE', 'degree latitude'),
            SimVar.GetSimVarValue('PLANE LONGITUDE', 'degree longitude'),
            SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet'),
        );
    }

    get(): VerticalProfileComputationParameters {
        return this.parameters;
    }

    canComputeProfile(): boolean {
        return this.parameters.v2Speed > 0;
    }
}
