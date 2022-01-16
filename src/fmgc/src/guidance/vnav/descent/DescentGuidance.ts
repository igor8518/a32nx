import { NavGeometryProfile, VerticalCheckpoint, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { VerticalMode } from '@shared/autopilot';
import { MathUtils } from '@shared/MathUtils';

enum RequestedVerticalMode {
    None = 0,
    SpeedThrust = 1,
    VpathThrust = 2,
    VpathSpeed = 3,
    FpaSpeed = 4,
    VsSpeed = 5,
}

type TargetAltitude = Feet;

type TargetVerticalSpeed = FeetPerMinute | Degrees

enum DescentGuidanceState {
    InvalidProfile,
    BeforeTopOfDescent,
    AfterTopOfDescent,
}

export class DescentGuidance {
    private state: DescentGuidanceState = DescentGuidanceState.InvalidProfile;

    private requestedVerticalMode: RequestedVerticalMode = RequestedVerticalMode.None;

    private targetAltitude: TargetAltitude = 0;

    private targetVerticalSpeed: TargetVerticalSpeed = 0;

    private showLinearDeviationOnPfd: boolean = false;

    private linearDeviation: Feet = 0;

    private showDescentLatchOnPfd: boolean = false;

    private currentProfile: NavGeometryProfile;

    private topOfDescent: VerticalCheckpoint;

    private inertialDistanceAlongTrack: InertialDistanceAlongTrack;

    constructor(private observer: VerticalProfileComputationParametersObserver) {
        this.inertialDistanceAlongTrack = new InertialDistanceAlongTrack();

        this.writeToSimVars();
    }

    updateProfile(profile: NavGeometryProfile) {
        const topOfDescent = profile?.findVerticalCheckpoint(VerticalCheckpointReason.TopOfDescent);
        const lastPosition = profile?.findVerticalCheckpoint(VerticalCheckpointReason.PresentPosition);

        const isProfileValid = !!topOfDescent && !!lastPosition;

        if (!isProfileValid) {
            this.updateState(DescentGuidanceState.InvalidProfile);
            return;
        }

        this.updateState(DescentGuidanceState.BeforeTopOfDescent);
        this.topOfDescent = topOfDescent;

        // TODO: Remove this
        profile.checkpoints = profile.checkpoints.filter(({ reason }) => reason !== VerticalCheckpointReason.PresentPosition);
        this.currentProfile = profile;

        this.inertialDistanceAlongTrack.updateCorrectInformation(lastPosition.distanceFromStart);
    }

    private updateState(newState: DescentGuidanceState) {
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
        this.currentProfile = undefined;
        this.topOfDescent = undefined;
        this.inertialDistanceAlongTrack = new InertialDistanceAlongTrack();
    }

    update() {
        if (this.state === DescentGuidanceState.InvalidProfile) {
            return;
        }

        this.inertialDistanceAlongTrack.update();

        const altitude = this.observer.get().presentPosition.alt;
        this.updateState(this.isInDescentSegment(altitude) ? DescentGuidanceState.AfterTopOfDescent : DescentGuidanceState.BeforeTopOfDescent);

        this.showLinearDeviationOnPfd = this.state === DescentGuidanceState.AfterTopOfDescent;

        const targetAltitude = this.currentProfile.interpolateAltitudeAtDistance(this.inertialDistanceAlongTrack.get());
        this.linearDeviation = this.computeVerticalDeviation(altitude, targetAltitude);

        if (this.observer.get().fcuVerticalMode !== VerticalMode.DES) {
            return;
        }

        const targetPathAngle = this.currentProfile.interpolatePathAngleAtDistance(this.inertialDistanceAlongTrack.get());

        const geometricPathStart = this.currentProfile.findVerticalCheckpoint(VerticalCheckpointReason.GeometricPathStart);
        const isOnGeometricPath = this.inertialDistanceAlongTrack.get() > geometricPathStart?.distanceFromStart;
        const isAboveSpeedLimitAltiude = altitude > this.observer.get().descentSpeedLimit?.underAltitude;

        const groundSpeed = SimVar.GetSimVarValue('GPS GROUND SPEED', 'Knots');

        // TODO: Convert to pressure alt?
        this.targetAltitude = targetAltitude;

        if (this.state === DescentGuidanceState.BeforeTopOfDescent || this.linearDeviation < -50) {
            // below path
            if (isOnGeometricPath) {
                this.requestedVerticalMode = RequestedVerticalMode.FpaSpeed;
                this.targetVerticalSpeed = targetPathAngle / 2;
            } else {
                this.requestedVerticalMode = RequestedVerticalMode.VsSpeed;
                this.targetVerticalSpeed = (isAboveSpeedLimitAltiude ? -1000 : -500);
            }
        } else if (this.linearDeviation > 50) {
            // above path
            this.requestedVerticalMode = RequestedVerticalMode.SpeedThrust;
        } else if (isOnGeometricPath) {
            // on geometric path

            this.requestedVerticalMode = RequestedVerticalMode.VpathSpeed;
            this.targetVerticalSpeed = targetPathAngle;
        } else {
            // on idle path

            this.requestedVerticalMode = RequestedVerticalMode.VpathThrust;
            this.targetVerticalSpeed = 101.269 * groundSpeed * Math.tan(targetPathAngle * MathUtils.DEGREES_TO_RADIANS);
        }

        this.writeToSimVars();
    }

    private computeVerticalDeviation(altitude: Feet, targetAltitude: Feet): Feet {
        return altitude - targetAltitude;
    }

    private isInDescentSegment(altitude: Feet) {
        const isPastTopOfDescent = this.inertialDistanceAlongTrack.get() > this.topOfDescent.distanceFromStart;

        // TODO: Use MDA here
        const isBeforeMissedApproachPoint = true;

        return isPastTopOfDescent && isBeforeMissedApproachPoint;
    }

    private writeToSimVars() {
        SimVar.SetSimVarValue('L:A32NX_FG_REQUESTED_VERTICAL_MODE', 'Enum', this.requestedVerticalMode);
        SimVar.SetSimVarValue('L:A32NX_FG_TARGET_ALTITUDE', 'Feet', this.targetAltitude);
        SimVar.SetSimVarValue('L:A32NX_FG_TARGET_VERTICAL_SPEED', 'number', this.targetVerticalSpeed);

        SimVar.SetSimVarValue('L:A32NX_PFD_LINEAR_DEVIATION_ACTIVE', 'Bool', this.showLinearDeviationOnPfd);
        SimVar.SetSimVarValue('L:A32NX_PFD_LINEAR_DEVIATION', 'Feet', this.linearDeviation);
        SimVar.SetSimVarValue('L:A32NX_PFD_VERTICAL_PROFILE_LATCHED', 'Bool', this.showDescentLatchOnPfd);
    }
}

class InertialDistanceAlongTrack {
    private lastUpdate: number = 0;

    private lastUpdateWithCorrectInformation: number = 0;

    private currentDistanceAlongTrack: number = 0;

    private groundSpeedModifier: number = 0;

    // Alpha beta constants for Alpha beta filter
    private alpha: number = 0.5;

    private beta: number = 0.5;

    updateCorrectInformation(actualDistanceAlongTrack: NauticalMiles) {
        const residual = actualDistanceAlongTrack - this.currentDistanceAlongTrack;

        this.currentDistanceAlongTrack += this.alpha * residual;
        this.groundSpeedModifier = this.beta * residual / (Date.now() - this.lastUpdateWithCorrectInformation);

        this.lastUpdate = Date.now();
        this.lastUpdateWithCorrectInformation = Date.now();
    }

    update() {
        // Should probably use ADR data here
        const groundSpeed = SimVar.GetSimVarValue('GPS GROUND SPEED', 'Knots');

        this.currentDistanceAlongTrack += (groundSpeed + this.groundSpeedModifier) * (Date.now() - this.lastUpdate) / 1000 / 60 / 60;

        this.lastUpdate = Date.now();
    }

    get() {
        return this.currentDistanceAlongTrack;
    }
}