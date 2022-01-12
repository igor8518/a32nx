import { SegmentType } from '@fmgc/flightplanning/FlightPlanSegment';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { FlightPlanManager } from '@fmgc/wtsdk';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { Geometry } from '../../Geometry';
import { AltitudeConstraint, AltitudeConstraintType, SpeedConstraint, SpeedConstraintType } from '../../lnav/legs';

// TODO: Merge this with VerticalCheckpoint
export interface VerticalWaypointPrediction {
    waypointIndex: number,
    distanceFromStart: NauticalMiles,
    secondsFromPresent: Seconds,
    altitude: Feet,
    speed: Knots,
    altitudeConstraint: AltitudeConstraint,
    speedConstraint: SpeedConstraint,
    isAltitudeConstraintMet: boolean,
    isSpeedConstraintMet: boolean,
    altError: number,
}

export enum VerticalCheckpointReason {
    Liftoff = 'Liftoff',
    ThrustReductionAltitude = 'ThrustReductionAltitude',
    AccelerationAltitude = 'AccelerationAltitude',
    TopOfClimb = 'TopOfClimb',
    AtmosphericConditions = 'AtmosphericConditions',
    PresentPosition = 'PresentPosition',
    LevelOffForConstraint = 'LevelOffForConstraint',
    AltitudeConstraint = 'AltitudeConstraint',
    ContinueClimb = 'ContinueClimb',
    CrossingSpeedLimit = 'CrossingSpeedLimit',
    SpeedConstraint = 'SpeedConstraint',
    CrossingFcuAltitude = 'FcuAltitude',

    // Descent
    TopOfDescent = 'TopOfDescent',
    IdlePathAtmosphericConditions = 'IdlePathAtmosphericConditions',
    IdlePathEnd = 'IdlePathEnd',

    // Approach
    Decel = 'Decel',
    Flaps1 = 'Flaps1',
    Flaps2 = 'Flaps2',
    Flaps3 = 'Flaps3',
    FlapsFull = 'FlapsFull',
    Landing = 'Landing',
}

export interface VerticalCheckpoint {
    reason: VerticalCheckpointReason,
    distanceFromStart: NauticalMiles,
    secondsFromPresent: Seconds,
    altitude: Feet,
    remainingFuelOnBoard: number,
    speed: Knots,
}

export interface MaxAltitudeConstraint {
    distanceFromStart: NauticalMiles,
    maxAltitude: Feet,
}

export interface MaxSpeedConstraint {
    distanceFromStart: NauticalMiles,
    maxSpeed: Feet,
}

export class NavGeometryProfile extends BaseGeometryProfile {
    public totalFlightPlanDistance: NauticalMiles = 0;

    public distanceToPresentPosition: NauticalMiles = 0;

    public override maxAltitudeConstraints: MaxAltitudeConstraint[] = [];

    public override maxSpeedConstraints: MaxSpeedConstraint[] = [];

    public waypointCount: number = 0;

    constructor(
        public geometry: Geometry,
        flightPlanManager: FlightPlanManager,
        activeLegIndex: number,
    ) {
        super();

        this.extractGeometryInformation(flightPlanManager, activeLegIndex);

        if (VnavConfig.DEBUG_PROFILE) {
            console.log('[FMS/VNAV] Altitude constraints:', this.maxAltitudeConstraints);
            console.log('[FMS/VNAV] Speed constraints:', this.maxSpeedConstraints);
        }
    }

    get lastCheckpoint(): VerticalCheckpoint | null {
        if (this.checkpoints.length < 1) {
            return null;
        }

        return this.checkpoints[this.checkpoints.length - 1];
    }

    addCheckpointFromLast(checkpointBuilder: (lastCheckpoint: VerticalCheckpoint) => Partial<VerticalCheckpoint>) {
        this.checkpoints.push({ ...this.lastCheckpoint, ...checkpointBuilder(this.lastCheckpoint) });
    }

    extractGeometryInformation(flightPlanManager: FlightPlanManager, activeLegIndex: number) {
        const { legs, transitions } = this.geometry;

        this.distanceToPresentPosition = -flightPlanManager.getDistanceToActiveWaypoint();
        this.waypointCount = flightPlanManager.getWaypointsCount();

        for (let i = 0; i < this.waypointCount; i++) {
            const leg = legs.get(i);

            if (!leg) {
                continue;
            }

            const inboundTransition = transitions.get(i - 1);

            const legDistance = Geometry.completeLegPathLengths(
                leg, (inboundTransition?.isNull || !inboundTransition?.isComputed) ? null : inboundTransition, transitions.get(i),
            ).reduce((sum, el) => sum + el, 0);
            this.totalFlightPlanDistance += legDistance;

            if (i <= activeLegIndex) {
                this.distanceToPresentPosition += legDistance;
            }

            if (leg.segment !== SegmentType.Origin && leg.segment !== SegmentType.Departure) {
                continue;
            }

            if (leg.altitudeConstraint && leg.altitudeConstraint.type !== AltitudeConstraintType.atOrAbove) {
                if (this.maxAltitudeConstraints.length < 1 || leg.altitudeConstraint.altitude1 >= this.maxAltitudeConstraints[this.maxAltitudeConstraints.length - 1].maxAltitude) {
                    this.maxAltitudeConstraints.push({
                        distanceFromStart: this.totalFlightPlanDistance,
                        maxAltitude: leg.altitudeConstraint.altitude1,
                    });
                }
            }

            if (leg.speedConstraint?.speed > 100 && leg.speedConstraint.type !== SpeedConstraintType.atOrAbove) {
                if (this.maxSpeedConstraints.length < 1 || leg.speedConstraint.speed >= this.maxSpeedConstraints[this.maxSpeedConstraints.length - 1].maxSpeed) {
                    this.maxSpeedConstraints.push({
                        distanceFromStart: this.totalFlightPlanDistance,
                        maxSpeed: leg.speedConstraint.speed,
                    });
                }
            }
        }
    }

    private hasSpeedChange(distanceFromStart: NauticalMiles, maxSpeed: Knots): boolean {
        for (let i = 0; i < this.checkpoints.length - 1; i++) {
            if (distanceFromStart >= this.checkpoints[i].distanceFromStart && distanceFromStart < this.checkpoints[i + 1].distanceFromStart) {
                return this.checkpoints[i + 1].speed > maxSpeed;
            }
        }

        return false;
    }

    /**
     * This is used to display predictions in the MCDU
     */
    computePredictionsAtWaypoints(): Map<number, VerticalWaypointPrediction> {
        const predictions = new Map<number, VerticalWaypointPrediction>();

        if (!this.isReadyToDisplay) {
            return predictions;
        }

        let totalDistance = 0;

        for (let i = 0; i < this.waypointCount; i++) {
            const leg = this.geometry.legs.get(i);
            if (!leg) {
                continue;
            }

            const inboundTransition = this.geometry.transitions.get(i - 1);

            totalDistance += Geometry.completeLegPathLengths(
                leg, (inboundTransition?.isNull || !inboundTransition?.isComputed) ? null : inboundTransition, this.geometry.transitions.get(i),
            ).reduce((sum, el) => sum + el, 0);

            const { secondsFromPresent, altitude, speed } = this.interpolateEverythingFromStart(totalDistance);

            predictions.set(i, {
                waypointIndex: i,
                distanceFromStart: totalDistance,
                secondsFromPresent,
                altitude,
                speed,
                altitudeConstraint: leg.altitudeConstraint,
                isAltitudeConstraintMet: this.isAltitudeConstraintMet(altitude, leg.altitudeConstraint),
                speedConstraint: leg.speedConstraint,
                isSpeedConstraintMet: this.isSpeedConstraintMet(speed, leg.speedConstraint),
                altError: this.computeAltError(altitude, leg.altitudeConstraint),
            });
        }

        return predictions;
    }

    // TODO: Make this not iterate over map
    override findDistancesToSpeedChanges(): NauticalMiles[] {
        const result: NauticalMiles[] = [];

        const predictions = this.computePredictionsAtWaypoints();
        if (VnavConfig.DEBUG_PROFILE) {
            console.log(predictions);
        }

        const speedLimitCrossing = this.findSpeedLimitCrossing();
        if (!speedLimitCrossing) {
            if (VnavConfig.DEBUG_PROFILE) {
                console.warn('[FMS/VNAV] No speed limit found.');
            }

            return [];
        }

        const [speedLimitDistance, speedLimitSpeed] = speedLimitCrossing;

        for (const [i, prediction] of predictions) {
            if (!predictions.has(i + 1)) {
                continue;
            }

            if (prediction.distanceFromStart < speedLimitDistance && predictions.get(i + 1).distanceFromStart > speedLimitDistance) {
                if (speedLimitSpeed < predictions.get(i + 1).speed) {
                    result.push(speedLimitDistance);
                }
            }

            if (prediction.speedConstraint && prediction.speedConstraint.speed > 100) {
                if (this.hasSpeedChange(prediction.distanceFromStart, prediction.speedConstraint.speed)) {
                    result.push(prediction.distanceFromStart);
                }
            }
        }

        return result;
    }

    private isAltitudeConstraintMet(altitude: Feet, constraint?: AltitudeConstraint): boolean {
        if (!constraint) {
            return true;
        }

        switch (constraint.type) {
        case AltitudeConstraintType.at:
            return Math.abs(altitude - constraint.altitude1) < 250;
        case AltitudeConstraintType.atOrAbove:
            return (altitude - constraint.altitude1) > -250;
        case AltitudeConstraintType.atOrBelow:
            return (altitude - constraint.altitude1) < 250;
        case AltitudeConstraintType.range:
            return (altitude - constraint.altitude2) > -250 && (altitude - constraint.altitude1) < 250;
        default:
            console.error('Invalid altitude constraint type');
            return null;
        }
    }

    private isSpeedConstraintMet(speed: Knots, constraint?: SpeedConstraint): boolean {
        if (!constraint) {
            return true;
        }

        switch (constraint.type) {
        case SpeedConstraintType.at:
            return Math.abs(speed - constraint.speed) < 5;
        case SpeedConstraintType.atOrBelow:
            return speed - constraint.speed < 5;
        case SpeedConstraintType.atOrAbove:
            return speed - constraint.speed > -5;
        default:
            console.error('Invalid speed constraint type');
            return null;
        }
    }

    private computeAltError(predictedAltitude: Feet, constraint?: AltitudeConstraint): number {
        if (!constraint) {
            return 0;
        }

        switch (constraint.type) {
        case AltitudeConstraintType.at:
            return predictedAltitude - constraint.altitude1;
        case AltitudeConstraintType.atOrAbove:
            return Math.min(predictedAltitude - constraint.altitude1, 0);
        case AltitudeConstraintType.atOrBelow:
            return Math.max(predictedAltitude - constraint.altitude1, 0);
        case AltitudeConstraintType.range:
            if (predictedAltitude >= constraint.altitude1) {
                return predictedAltitude - constraint.altitude1;
            } if (predictedAltitude <= constraint.altitude2) {
                return predictedAltitude - constraint.altitude1;
            }

            return 0;
        default:
            console.error('Invalid altitude constraint type');
            return 0;
        }
    }
}
