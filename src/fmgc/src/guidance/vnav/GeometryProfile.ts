import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { Geometry } from '../Geometry';
import { AltitudeConstraint, AltitudeConstraintType, SpeedConstraint, SpeedConstraintType } from '../lnav/legs';

// TODO: Merge this with VerticalCheckpoint
interface VerticalWaypointPrediction {
    waypointIndex: number,
    distanceFromStart: NauticalMiles
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
    altitude: Feet,
    remainingFuelOnBoard: number,
    speed: Knots,
}

export class GeometryProfile {
    private totalFlightPlanDistance: NauticalMiles = 0;

    constructor(
        public geometry: Geometry,
        public checkpoints: VerticalCheckpoint[],
    ) {
        this.checkpoints = [...checkpoints].sort((a, b) => a.distanceFromStart - b.distanceFromStart);

        this.totalFlightPlanDistance = this.totalDistance();
    }

    totalDistance(): NauticalMiles {
        let totalDistance = 0;

        const { legs, transitions } = this.geometry;

        for (const [i, leg] of legs.entries()) {
            totalDistance += Geometry.completeLegPathLengths(leg, transitions.get(i - 1), transitions.get(i)).reduce((sum, el) => sum + el, 0);
        }

        return totalDistance;
    }

    /**
     * Find the altitude at which the profile predicts us to be at a distance along the flightplan.
     * @param distanceFromStart Distance along that path
     * @returns Predicted altitude
     */
    private interpolateAltitude(distanceFromStart: NauticalMiles): Feet {
        if (distanceFromStart < this.checkpoints[0].distanceFromStart) {
            return this.checkpoints[0].altitude;
        }

        for (let i = 0; i < this.checkpoints.length - 1; i++) {
            if (distanceFromStart >= this.checkpoints[i].distanceFromStart && distanceFromStart < this.checkpoints[i + 1].distanceFromStart) {
                return this.checkpoints[i].altitude
                    + (distanceFromStart - this.checkpoints[i].distanceFromStart) * (this.checkpoints[i + 1].altitude - this.checkpoints[i].altitude)
                    / (this.checkpoints[i + 1].distanceFromStart - this.checkpoints[i].distanceFromStart);
            }
        }

        return this.checkpoints[this.checkpoints.length - 1].altitude;
    }

    /**
     * I am not sure how well this works.
     * Find speed target to the next waypoint
     * @param distanceFromStart Distance along that path
     * @returns Predicted altitude
     */
    private findSpeedTarget(distanceFromStart: NauticalMiles): Feet {
        // We check for this because there is no speed change point upon reaching acceleration altitude.
        const indexOfAccelerationAltitudeCheckpoint = Math.min(this.checkpoints.length - 1, Math.max(this.checkpoints.findIndex(({ reason }) => reason === VerticalCheckpointReason.AccelerationAltitude) + 1, 0));

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
     * Find distance to first point along path at which we cross a certain altitude.
     * @param altitude Altitude to find along the path
     * @returns Distance along path
     */
    private interpolateDistance(altitude: Feet): NauticalMiles {
        if (altitude < this.checkpoints[0].altitude) {
            return this.checkpoints[0].distanceFromStart;
        }

        for (let i = 0; i < this.checkpoints.length - 1; i++) {
            if (altitude >= this.checkpoints[i].altitude && altitude < this.checkpoints[i + 1].altitude) {
                return this.checkpoints[i].distanceFromStart
                    + (altitude - this.checkpoints[i].altitude) * (this.checkpoints[i + 1].distanceFromStart - this.checkpoints[i].distanceFromStart)
                    / (this.checkpoints[i + 1].altitude - this.checkpoints[i].altitude);
            }
        }

        return Infinity;
    }

    /**
     * This is used to display predictions in the MCDU
     */
    computePredictionsAtWaypoints(): Map<number, VerticalWaypointPrediction> {
        const predictions = new Map<number, VerticalWaypointPrediction>();
        let totalDistance = 0;

        for (const [i, leg] of this.geometry.legs.entries()) {
            totalDistance += Geometry.completeLegPathLengths(leg, this.geometry.transitions.get(i - 1), this.geometry.transitions.get(i)).reduce((sum, el) => sum + el, 0);

            const predictedAltitudeAtEndOfLeg = this.interpolateAltitude(totalDistance);
            const predictedSpeedAtEndOfLeg = this.findSpeedTarget(totalDistance);

            predictions.set(i, {
                waypointIndex: i,
                distanceFromStart: totalDistance,
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

    findDistanceToTopOfClimbFromEnd(): NauticalMiles | undefined {
        const distance = this.totalFlightPlanDistance - this.checkpoints.find((checkpoint) => checkpoint.reason === VerticalCheckpointReason.TopOfClimb)?.distanceFromStart;

        if (distance < 0) {
            return undefined;
        }

        return distance;
    }

    findDistanceFromEndToEarliestLevelOffForRestriction(): NauticalMiles | undefined {
        const distance = this.totalFlightPlanDistance - this.checkpoints.find((checkpoint) => checkpoint.reason === VerticalCheckpointReason.LevelOffForConstraint)?.distanceFromStart;

        if (distance < 0) {
            return undefined;
        }

        return distance;
    }

    findDistanceFromEndToEarliestContinueClimb(): NauticalMiles | undefined {
        const distance = this.totalFlightPlanDistance - this.checkpoints.find((checkpoint) => checkpoint.reason === VerticalCheckpointReason.ContinueClimb)?.distanceFromStart;

        if (distance < 0) {
            return undefined;
        }

        return distance;
    }

    findDistanceFromEndToSpeedLimit(): NauticalMiles | undefined {
        const distance = this.totalFlightPlanDistance - this.checkpoints.find((checkpoint) => checkpoint.reason === VerticalCheckpointReason.CrossingSpeedLimit)?.distanceFromStart;

        if (distance < 0) {
            return undefined;
        }

        return distance;
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
}
