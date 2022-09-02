import { Filter } from '@fmgc/guidance/vnav/descent/InertialDistanceAlongTrack';
import { NavGeometryProfile, VerticalCheckpoint, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { MathUtils } from '@shared/MathUtils';

export class AircraftToDescentProfileRelation {
    public isValid: boolean = false;

    private currentProfile?: NavGeometryProfile;

    private topOfDescent?: VerticalCheckpoint;

    private geometricPathStart?: VerticalCheckpoint;

    private distanceToEnd: Filter;

    private totalFlightPlanDistance: number = 0;

    constructor(private observer: VerticalProfileComputationParametersObserver) {
        this.distanceToEnd = new Filter(1);
    }

    updateProfile(profile: NavGeometryProfile) {
        const topOfDescent = profile?.findVerticalCheckpoint(VerticalCheckpointReason.TopOfDescent);
        const lastPosition = profile?.findVerticalCheckpoint(VerticalCheckpointReason.PresentPosition) ?? profile.checkpoints[0];
        const geometricPathStart = profile?.findVerticalCheckpoint(VerticalCheckpointReason.GeometricPathStart);

        const isProfileValid = !!topOfDescent && !!lastPosition && !!geometricPathStart;

        if (!isProfileValid) {
            this.invalidate();

            // If the profile is empty, we don't bother logging that it's invalid, because it probably just hasn't been computed yet.
            if (VnavConfig.DEBUG_PROFILE && profile.checkpoints.length >= 0) {
                console.warn('[FMS/VNAV] Invalid profile');
            }

            return;
        }

        this.isValid = isProfileValid;

        this.topOfDescent = topOfDescent;
        this.geometricPathStart = geometricPathStart;

        // TODO: Remove this
        profile.checkpoints = profile.checkpoints.filter(({ reason }) => reason !== VerticalCheckpointReason.PresentPosition);

        this.currentProfile = profile;
        this.totalFlightPlanDistance = profile.totalFlightPlanDistance;

        this.distanceToEnd.reset(profile.totalFlightPlanDistance - profile.distanceToPresentPosition);
    }

    private invalidate() {
        this.isValid = false;
        this.currentProfile = undefined;
        this.topOfDescent = undefined;
    }

    private get distanceFromStart(): NauticalMiles {
        return this.totalFlightPlanDistance - this.distanceToEnd.output;
    }

    update(distanceToEnd: number) {
        if (!this.isValid) {
            return;
        }

        if (VnavConfig.DEBUG_PROFILE) {
            this.distanceToEnd.weight = SimVar.GetSimVarValue('L:A32NX_FM_VNAV_DEBUG_FILTER_CONSTANT', 'number');
        }

        this.distanceToEnd.update(distanceToEnd);
    }

    isPastTopOfDescent(): boolean {
        return !this.topOfDescent || this.distanceFromStart > this.topOfDescent.distanceFromStart;
    }

    distanceToTopOfDescent(): number | null {
        if (this.topOfDescent) {
            return this.topOfDescent.distanceFromStart - this.distanceFromStart;
        }

        return null;
    }

    isOnGeometricPath(): boolean {
        return this.distanceFromStart > this.geometricPathStart.distanceFromStart;
    }

    computeLinearDeviation(): Feet {
        const altitude = this.observer.get().presentPosition.alt;
        const targetAltitude = this.currentTargetAltitude();

        return altitude - targetAltitude;
    }

    currentTargetAltitude(): Feet {
        return this.currentProfile.interpolateAltitudeAtDistance(this.distanceFromStart);
    }

    currentTargetSpeed(): Feet {
        return this.currentProfile.findNextSpeedTarget(this.distanceFromStart);
    }

    currentTargetPathAngle(): Degrees {
        return this.currentProfile.interpolatePathAngleAtDistance(this.distanceFromStart);
    }

    currentTargetVerticalSpeed(): FeetPerMinute {
        const groundSpeed = SimVar.GetSimVarValue('GPS GROUND SPEED', 'Knots');

        const knotsToFeetPerMinute = 101.269;
        return knotsToFeetPerMinute * groundSpeed * Math.tan(this.currentTargetPathAngle() * MathUtils.DEGREES_TO_RADIANS);
    }

    isAboveSpeedLimitAltitude(): boolean {
        const { presentPosition, descentSpeedLimit } = this.observer.get();

        return presentPosition.alt > descentSpeedLimit?.underAltitude;
    }

    isCloseToAirfieldElevation(): boolean {
        const { destinationAirfieldElevation, presentPosition } = this.observer.get();

        return presentPosition.alt < destinationAirfieldElevation + 5000;
    }
}
