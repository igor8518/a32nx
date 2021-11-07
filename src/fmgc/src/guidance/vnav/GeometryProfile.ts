import { SegmentType } from '@fmgc/flightplanning/FlightPlanSegment';
import { Common } from '@fmgc/guidance/vnav/common';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { FlightPlanManager } from '@fmgc/wtsdk';
import { PseudoWaypointFlightPlanInfo } from '@fmgc/guidance/PsuedoWaypoint';
import { Geometry } from '../Geometry';
import { AltitudeConstraint, AltitudeConstraintType, SpeedConstraint, SpeedConstraintType } from '../lnav/legs';

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
}

export enum VerticalCheckpointReason {
    Liftoff = 'Liftoff',
    ThrustReductionAltitude = 'ThrustReductionAltitude',
    AccelerationAltitude = 'AccelerationAltitude',
    TopOfClimb = 'TopOfClimb',
    AtmosphericConditions = 'AtmosphericConditions',
    PresentPosition = 'PresentPosition',
    LevelOffForConstraint = 'LevelOffForConstraint',
    WaypointWithConstraint = 'WaypointWithConstraint',
    ContinueClimb = 'ContinueClimb',
    CrossingSpeedLimit = 'CrossingSpeedLimit',
    SpeedConstraint = 'SpeedConstraint',

    // Descent
    TopOfDescent = 'TopOfDescent',
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

export class GeometryProfile {
    public isReadyToDisplay: boolean = false;

    public totalFlightPlanDistance: NauticalMiles = 0;

    public distanceToPresentPosition: NauticalMiles = 0;

    public checkpoints: VerticalCheckpoint[] = [];

    public maxAltitudeConstraints: MaxAltitudeConstraint[] = [];

    public maxSpeedConstraints: MaxSpeedConstraint[] = [];

    constructor(
        public geometry: Geometry,
        flightPlanManager: FlightPlanManager,
        activeLegIndex: number,
    ) {
        this.extractGeometryInformation(flightPlanManager, activeLegIndex);

        if (DEBUG) {
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

        for (const [i, leg] of legs.entries()) {
            const legDistance = Geometry.completeLegPathLengths(leg, transitions.get(i - 1), transitions.get(i)).reduce((sum, el) => sum + el, 0);
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

    predictAtTime(secondsFromPresent: Seconds): PseudoWaypointFlightPlanInfo {
        const utcSeconds = Math.floor(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds'));
        const distanceFromStart = this.interpolateDistanceAtTime(secondsFromPresent - utcSeconds);

        return {
            distanceFromStart,
            altitude: this.interpolateAltitudeAtDistance(distanceFromStart),
            speed: this.findSpeedTarget(distanceFromStart),
        };
    }

    private interpolateFromCheckpoints<T extends number, U extends number>(
        indexValue: T, keySelector: (checkpoint: VerticalCheckpoint) => T, valueSelector: (checkpoint: VerticalCheckpoint) => U,
    ) {
        if (indexValue < keySelector(this.checkpoints[0])) {
            return valueSelector(this.checkpoints[0]);
        }

        for (let i = 0; i < this.checkpoints.length - 1; i++) {
            if (indexValue >= keySelector(this.checkpoints[i]) && indexValue < keySelector(this.checkpoints[i + 1])) {
                return Common.interpolate(
                    indexValue,
                    keySelector(this.checkpoints[i]),
                    keySelector(this.checkpoints[i + 1]),
                    valueSelector(this.checkpoints[i]),
                    valueSelector(this.checkpoints[i + 1]),
                );
            }
        }

        return valueSelector(this.checkpoints[this.checkpoints.length - 1]);
    }

    /**
     * Find the time from start at which the profile predicts us to be at a distance along the flightplan.
     * @param distanceFromStart Distance along that path
     * @returns Predicted altitude
     */
    interpolateTimeAtDistance(distanceFromStart: NauticalMiles): Seconds {
        return this.interpolateFromCheckpoints(distanceFromStart, (checkpoint) => checkpoint.distanceFromStart, (checkpoint) => checkpoint.secondsFromPresent);
    }

    /**
     * Find the altitude at which the profile predicts us to be at a distance along the flightplan.
     * @param distanceFromStart Distance along that path
     * @returns Predicted altitude
     */
    interpolateAltitudeAtDistance(distanceFromStart: NauticalMiles): Feet {
        return this.interpolateFromCheckpoints(distanceFromStart, (checkpoint) => checkpoint.distanceFromStart, (checkpoint) => checkpoint.altitude);
    }

    /**
     * Find the altitude at which the profile predicts us to be at a distance along the flightplan.
     * @param distanceFromStart Distance along that path
     * @returns Predicted altitude
     */
    interpolateDistanceAtTime(secondsFromPresent: Seconds): NauticalMiles {
        return this.interpolateFromCheckpoints(secondsFromPresent, (checkpoint) => checkpoint.secondsFromPresent, (checkpoint) => checkpoint.distanceFromStart);
    }

    interpolateEverythingFromStart(distanceFromStart: NauticalMiles): Omit<VerticalCheckpoint, 'speed' | 'reason'> {
        if (distanceFromStart < this.checkpoints[0].distanceFromStart) {
            return {
                distanceFromStart,
                secondsFromPresent: this.checkpoints[0].secondsFromPresent,
                altitude: this.checkpoints[0].altitude,
                remainingFuelOnBoard: this.checkpoints[0].remainingFuelOnBoard,
            };
        }

        for (let i = 0; i < this.checkpoints.length - 1; i++) {
            if (distanceFromStart >= this.checkpoints[i].distanceFromStart && distanceFromStart < this.checkpoints[i + 1].distanceFromStart) {
                return {
                    distanceFromStart,
                    secondsFromPresent: Common.interpolate(
                        distanceFromStart,
                        this.checkpoints[i].distanceFromStart,
                        this.checkpoints[i + 1].distanceFromStart,
                        this.checkpoints[i].secondsFromPresent,
                        this.checkpoints[i + 1].secondsFromPresent,
                    ),
                    altitude: Common.interpolate(
                        distanceFromStart,
                        this.checkpoints[i].distanceFromStart,
                        this.checkpoints[i + 1].distanceFromStart,
                        this.checkpoints[i].altitude,
                        this.checkpoints[i + 1].altitude,
                    ),
                    remainingFuelOnBoard: Common.interpolate(
                        distanceFromStart,
                        this.checkpoints[i].distanceFromStart,
                        this.checkpoints[i + 1].distanceFromStart,
                        this.checkpoints[i].remainingFuelOnBoard,
                        this.checkpoints[i + 1].remainingFuelOnBoard,
                    ),
                };
            }
        }

        return {
            distanceFromStart,
            secondsFromPresent: this.lastCheckpoint.secondsFromPresent,
            altitude: this.lastCheckpoint.altitude,
            remainingFuelOnBoard: this.lastCheckpoint.remainingFuelOnBoard,
        };
    }

    /**
     * I am not sure how well this works.
     * Find speed target to the next waypoint
     * @param distanceFromStart Distance along that path
     * @returns Predicted altitude
     */
    private findSpeedTarget(distanceFromStart: NauticalMiles): Feet {
        // We check for this because there is no speed change point upon reaching acceleration altitude.
        const indexOfAccelerationAltitudeCheckpoint = Math.min(
            this.checkpoints.length - 1,
            Math.max(this.checkpoints.findIndex(({ reason }) => reason === VerticalCheckpointReason.AccelerationAltitude) + 1, 0),
        );

        if (distanceFromStart <= this.checkpoints[indexOfAccelerationAltitudeCheckpoint].distanceFromStart) {
            return this.checkpoints[indexOfAccelerationAltitudeCheckpoint].speed;
        }

        for (let i = indexOfAccelerationAltitudeCheckpoint; i < this.checkpoints.length - 1; i++) {
            if (distanceFromStart > this.checkpoints[i].distanceFromStart && distanceFromStart <= this.checkpoints[i + 1].distanceFromStart) {
                return this.checkpoints[i + 1].speed;
            }
        }

        return this.checkpoints[this.checkpoints.length - 1].speed;
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

        for (const [i, leg] of this.geometry.legs.entries()) {
            totalDistance += Geometry.completeLegPathLengths(leg, this.geometry.transitions.get(i - 1), this.geometry.transitions.get(i)).reduce((sum, el) => sum + el, 0);

            const predictedSecondsFromStartAtEndOfLeg = this.interpolateTimeAtDistance(totalDistance);
            const predictedAltitudeAtEndOfLeg = this.interpolateAltitudeAtDistance(totalDistance);
            const predictedSpeedAtEndOfLeg = this.findSpeedTarget(totalDistance);

            predictions.set(i, {
                waypointIndex: i,
                distanceFromStart: totalDistance,
                secondsFromPresent: predictedSecondsFromStartAtEndOfLeg,
                altitude: predictedAltitudeAtEndOfLeg,
                speed: predictedSpeedAtEndOfLeg,
                altitudeConstraint: leg.altitudeConstraint,
                isAltitudeConstraintMet: this.isAltitudeConstraintMet(predictedAltitudeAtEndOfLeg, leg.altitudeConstraint),
                speedConstraint: leg.speedConstraint,
                isSpeedConstraintMet: this.isSpeedConstraintMet(predictedSpeedAtEndOfLeg, leg.speedConstraint),
            });
        }

        return predictions;
    }

    findVerticalCheckpoint(reason: VerticalCheckpointReason): VerticalCheckpoint | undefined {
        return this.checkpoints.find((checkpoint) => checkpoint.reason === reason);
    }

    // TODO: We shouldn't have to go looking for this here...
    // This logic probably belongs to `ClimbPathBuilder`.
    findSpeedLimitCrossing(): [NauticalMiles, Knots] | undefined {
        const speedLimit = this.checkpoints.find((checkpoint) => checkpoint.reason === VerticalCheckpointReason.CrossingSpeedLimit);

        if (!speedLimit) {
            return undefined;
        }

        return [speedLimit.distanceFromStart, speedLimit.speed];
    }

    // TODO: Make this not iterate over map
    findDistancesFromEndToSpeedChanges(): NauticalMiles[] {
        const result: NauticalMiles[] = [];

        const predictions = this.computePredictionsAtWaypoints();
        console.log(predictions);

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
                    result.push(this.totalFlightPlanDistance - speedLimitDistance);
                }
            }

            if (prediction.speedConstraint && prediction.speedConstraint.speed > 100) {
                if (this.hasSpeedChange(prediction.distanceFromStart, prediction.speedConstraint.speed)) {
                    result.push(this.totalFlightPlanDistance - prediction.distanceFromStart);
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

    private isSpeedConstraintMet(speed: Feet, constraint?: SpeedConstraint): boolean {
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
            console.error('Invalid altitude constraint type');
            return null;
        }
    }

    addSpeedCheckpoint(distanceFromStart: NauticalMiles, speed: Knots, reason: VerticalCheckpointReason) {
        if (distanceFromStart < this.checkpoints[0].distanceFromStart) {
            this.checkpoints.unshift({ ...this.interpolateEverythingFromStart(distanceFromStart), speed, reason });
            return;
        }

        for (let i = 0; i < this.checkpoints.length - 1; i++) {
            if (distanceFromStart > this.checkpoints[i].distanceFromStart && distanceFromStart <= this.checkpoints[i + 1].distanceFromStart) {
                this.checkpoints.splice(i + 1, 0, { reason, ...this.interpolateEverythingFromStart(distanceFromStart), speed });
                return;
            }
        }

        this.checkpoints.push({ ...this.interpolateEverythingFromStart(distanceFromStart), speed, reason });
    }

    public finalizeProfile() {
        this.checkpoints.sort((a, b) => a.distanceFromStart - b.distanceFromStart);

        this.isReadyToDisplay = true;
    }
}
