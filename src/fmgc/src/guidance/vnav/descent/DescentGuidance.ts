import { RequestedVerticalMode, TargetAltitude, TargetVerticalSpeed } from '@fmgc/guidance/ControlLaws';
import { AircraftToDescentProfileRelation } from '@fmgc/guidance/vnav/descent/AircraftToProfileRelation';
import { NavGeometryProfile } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { VerticalMode } from '@shared/autopilot';
import { FmgcFlightPhase } from '@shared/flightphase';
import { SpeedMargin } from './SpeedMargin';

enum DescentGuidanceState {
    InvalidProfile,
    ProvidingGuidance,
    Observing
}

export class DescentGuidance {
    private state: DescentGuidanceState = DescentGuidanceState.InvalidProfile;

    private requestedVerticalMode: RequestedVerticalMode = RequestedVerticalMode.None;

    private targetAltitude: TargetAltitude = 0;

    private targetVerticalSpeed: TargetVerticalSpeed = 0;

    private showLinearDeviationOnPfd: boolean = false;

    private linearDeviation: Feet = 0;

    private showDescentLatchOnPfd: boolean = false;

    private speedMargin: SpeedMargin;

    constructor(private aircraftToDescentProfileRelation: AircraftToDescentProfileRelation, private observer: VerticalProfileComputationParametersObserver) {
        const { managedDescentSpeed, descentSpeedLimit } = this.observer.get();
        this.speedMargin = new SpeedMargin(managedDescentSpeed, descentSpeedLimit);

        this.writeToSimVars();
    }

    updateProfile(profile: NavGeometryProfile) {
        this.aircraftToDescentProfileRelation.updateProfile(profile);

        if (!this.aircraftToDescentProfileRelation.isValid) {
            this.changeState(DescentGuidanceState.InvalidProfile);
            return;
        }

        this.changeState(DescentGuidanceState.Observing);
    }

    private changeState(newState: DescentGuidanceState) {
        if (this.state === newState) {
            return;
        }

        if (this.state !== DescentGuidanceState.InvalidProfile && newState === DescentGuidanceState.InvalidProfile) {
            this.reset();
            this.writeToSimVars();
        }

        this.state = newState;
    }

    private reset() {
        this.requestedVerticalMode = RequestedVerticalMode.None;
        this.targetAltitude = 0;
        this.targetVerticalSpeed = 0;
        this.showLinearDeviationOnPfd = false;
        this.linearDeviation = 0;
        this.showDescentLatchOnPfd = false;
    }

    update() {
        this.aircraftToDescentProfileRelation.update();

        if (!this.aircraftToDescentProfileRelation.isValid) {
            return;
        }

        if (this.observer.get().fcuVerticalMode === VerticalMode.DES) {
            this.changeState(DescentGuidanceState.ProvidingGuidance);
        }

        if (this.state === DescentGuidanceState.ProvidingGuidance) {
            this.updateDesModeGuidance();
        }

        this.updateLinearDeviation();
        this.writeToSimVars();
    }

    private updateLinearDeviation() {
        this.linearDeviation = this.aircraftToDescentProfileRelation.computeLinearDeviation();

        this.showLinearDeviationOnPfd = this.observer.get().flightPhase >= FmgcFlightPhase.Descent || this.aircraftToDescentProfileRelation.isPastTopOfDescent();
    }

    private updateDesModeGuidance() {
        const targetPathAngle = this.aircraftToDescentProfileRelation.currentTargetPathAngle();
        const isOnGeometricPath = this.aircraftToDescentProfileRelation.isOnGeometricPath();
        const isAboveSpeedLimitAltitude = this.aircraftToDescentProfileRelation.isAboveSpeedLimitAltitude();
        const isBeforeTopOfDescent = !this.aircraftToDescentProfileRelation.isPastTopOfDescent();

        // const airspeed = SimVar.GetSimVarValue('AIRSPEED INDICATED', 'Knots');
        // SimVar.SetSimVarValue('L:A32NX_SPEEDS_MANAGED_ATHR', 'knots', this.speedMargin.getTarget(airspeed));

        this.targetAltitude = this.aircraftToDescentProfileRelation.currentTargetAltitude();

        if (isBeforeTopOfDescent || this.linearDeviation < -100) {
            // below path
            if (isOnGeometricPath) {
                this.requestedVerticalMode = RequestedVerticalMode.FpaSpeed;
                this.targetVerticalSpeed = targetPathAngle / 2;
            } else {
                this.requestedVerticalMode = RequestedVerticalMode.VsSpeed;
                this.targetVerticalSpeed = (isAboveSpeedLimitAltitude ? -1000 : -500);
            }
        } else if (this.linearDeviation > 100) {
            // above path
            this.requestedVerticalMode = RequestedVerticalMode.SpeedThrust;
        } else if (isOnGeometricPath) {
            // on geometric path

            this.requestedVerticalMode = RequestedVerticalMode.VpathSpeed;
            this.targetVerticalSpeed = targetPathAngle;
        } else {
            // on idle path

            this.requestedVerticalMode = RequestedVerticalMode.VpathThrust;
            this.targetVerticalSpeed = this.aircraftToDescentProfileRelation.currentTargetVerticalSpeed();
        }
    }

    private writeToSimVars() {
        SimVar.SetSimVarValue('L:A32NX_FG_REQUESTED_VERTICAL_MODE', 'Enum', this.requestedVerticalMode);
        SimVar.SetSimVarValue('L:A32NX_FG_TARGET_ALTITUDE', 'Feet', this.targetAltitude);
        SimVar.SetSimVarValue('L:A32NX_FG_TARGET_VERTICAL_SPEED', 'number', this.targetVerticalSpeed);

        SimVar.SetSimVarValue('L:A32NX_PFD_LINEAR_DEVIATION_ACTIVE', 'Bool', this.showLinearDeviationOnPfd);
        SimVar.SetSimVarValue('L:A32NX_PFD_LINEAR_DEVIATION', 'Feet', this.linearDeviation);
        SimVar.SetSimVarValue('L:A32NX_PFD_VERTICAL_PROFILE_LATCHED', 'Bool', this.showDescentLatchOnPfd);

        const [lower, upper] = this.speedMargin.getMargins();

        SimVar.SetSimVarValue('L:A32NX_PFD_LOWER_SPEED_MARGIN', 'Bool', lower);
        SimVar.SetSimVarValue('L:A32NX_PFD_UPPER_SPEED_MARGIN', 'Bool', upper);
    }
}
