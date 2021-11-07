import { Fmgc } from '@fmgc/guidance/GuidanceController';
import { SpeedLimit } from '@fmgc/guidance/vnav/SpeedLimit';
import { ArmedLateralMode, ArmedVerticalMode, LateralMode, VerticalMode } from '@shared/autopilot';

export interface VerticalProfileComputationParameters {
    presentPosition: LatLongAlt,

    fcuAltitude: Feet,
    fcuVerticalMode: VerticalMode,
    fcuLateralMode: LateralMode,
    fcuVerticalSpeed: FeetPerMinute,
    fcuFlightPathAngle: Degrees,
    fcuSpeed: Knots | Mach,
    fcuArmedLateralMode: ArmedLateralMode,
    fcuArmedVerticalMode: ArmedVerticalMode,

    managedCruiseSpeed: Knots,
    managedCruiseSpeedMach: Mach,

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
    flightPhase: FlightPhase,
    preselectedClbSpeed: Knots,
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
            fcuVerticalSpeed: SimVar.GetSimVarValue('L:A32NX_AUTOPILOT_VS_SELECTED', 'Feet per minute'),
            fcuFlightPathAngle: SimVar.GetSimVarValue('L:A32NX_AUTOPILOT_FPA_SELECTED', 'Degrees'),
            fcuSpeed: SimVar.GetSimVarValue('L:A32NX_AUTOPILOT_SPEED_SELECTED', 'number'),
            fcuArmedLateralMode: SimVar.GetSimVarValue('L:A32NX_FMA_LATERAL_ARMED', 'number'),
            fcuArmedVerticalMode: SimVar.GetSimVarValue('L:A32NX_FMA_VERTICAL_ARMED', 'number'),

            managedCruiseSpeed: this.fmgc.getManagedCruiseSpeed(),
            managedCruiseSpeedMach: this.fmgc.getManagedCruiseSpeedMach(),

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
            speedLimit: this.fmgc.getSpeedLimit(),
            flightPhase: this.fmgc.getFlightPhase(),
            preselectedClbSpeed: this.fmgc.getPreSelectedClbSpeed(),
        };
    }

    getPresentPosition(): LatLongAlt {
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
