import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { DescentStrategy } from '@fmgc/guidance/vnav/descent/DescentStrategy';
import { StepResults } from '@fmgc/guidance/vnav/Predictions';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { MaxSpeedConstraint, VerticalCheckpoint, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { TemporaryCheckpointSequence } from '@fmgc/guidance/vnav/profile/TemporaryCheckpointSequence';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { HeadwindProfile } from '@fmgc/guidance/vnav/wind/HeadwindProfile';

export class TacticalDescentPathBuilder {
    constructor(private observer: VerticalProfileComputationParametersObserver) { }

    /**
     * Builds a path from the last checkpoint to the finalAltitude
     * @param profile
     * @param descentStrategy
     * @param speedProfile
     * @param windProfile
     * @param finalAltitude
     */
    buildTacticalDescentPath(profile: BaseGeometryProfile, descentStrategy: DescentStrategy, speedProfile: SpeedProfile, windProfile: HeadwindProfile, finalAltitude: Feet) {
        const constraintsToUse = profile.descentSpeedConstraints
            .slice()
            .reverse()
            .sort((a, b) => a.distanceFromStart - b.distanceFromStart);

        const { descentSpeedLimit, managedDescentSpeedMach } = this.observer.get();
        if (speedProfile.shouldTakeDescentSpeedLimitIntoAccount() && finalAltitude < descentSpeedLimit.underAltitude && profile.lastCheckpoint.speed > descentSpeedLimit.speed) {
            let descentSegment = new TemporaryCheckpointSequence(profile.lastCheckpoint);
            let decelerationSegment: StepResults = null;

            const tryDecelDistance = (speedLimitDecelAltitude: Feet): Feet => {
                descentSegment = this.buildToAltitude(profile.lastCheckpoint, descentStrategy, constraintsToUse, windProfile, speedLimitDecelAltitude);

                // If we've already decelerated below the constraint speed due to a previous constraint, we don't need to decelerate anymore.
                // We return 0 because the bisection method will terminate if the error is zero.
                if (descentSegment.lastCheckpoint.speed <= descentSpeedLimit.speed) {
                    return 0;
                }

                decelerationSegment = descentStrategy.predictToSpeed(
                    descentSegment.lastCheckpoint.altitude,
                    Math.min(descentSegment.lastCheckpoint.speed, descentSpeedLimit.speed),
                    descentSegment.lastCheckpoint.speed,
                    managedDescentSpeedMach,
                    descentSegment.lastCheckpoint.remainingFuelOnBoard,
                    windProfile.getHeadwindComponent(descentSegment.lastCheckpoint.distanceFromStart, descentSegment.lastCheckpoint.altitude),
                );

                const altitudeOvershoot = decelerationSegment.finalAltitude - descentSpeedLimit.underAltitude;

                return altitudeOvershoot;
            };

            bisectionMethod(tryDecelDistance, descentSpeedLimit.underAltitude, Math.min(descentSpeedLimit.underAltitude + 6000, profile.lastCheckpoint.altitude), [-10, 500], 10);

            // If we returned early, it's possible that it was not necessary to compute a `decelerationSegment`, so this would be null
            if (decelerationSegment) {
                descentSegment.addCheckpointFromStep(decelerationSegment, VerticalCheckpointReason.AtmosphericConditions);
            }

            profile.checkpoints.push(...descentSegment.get());
        }

        const sequenceToFinalAltitude = this.buildToAltitude(profile.lastCheckpoint, descentStrategy, constraintsToUse, windProfile, finalAltitude);

        profile.checkpoints.push(...sequenceToFinalAltitude.get());
    }

    private buildToAltitude(
        start: VerticalCheckpoint, descentStrategy: DescentStrategy, constraints: MaxSpeedConstraint[], windProfile: HeadwindProfile, finalAltitude: Feet,
    ): TemporaryCheckpointSequence {
        const sequence = new TemporaryCheckpointSequence(start);
        const { managedDescentSpeedMach } = this.observer.get();

        for (const constraint of constraints) {
            this.handleSpeedConstraint(sequence, constraint, descentStrategy, windProfile);

            if (sequence.lastCheckpoint.altitude <= finalAltitude) {
                while (sequence.checkpoints.length > 1 && sequence.lastCheckpoint.altitude <= finalAltitude) {
                    sequence.checkpoints.splice(-1, 1);
                }

                break;
            }
        }

        if (sequence.lastCheckpoint.altitude > finalAltitude) {
            const descentSegment = descentStrategy.predictToAltitude(
                sequence.lastCheckpoint.altitude,
                finalAltitude,
                sequence.lastCheckpoint.speed,
                managedDescentSpeedMach,
                sequence.lastCheckpoint.remainingFuelOnBoard,
                windProfile.getHeadwindComponent(sequence.lastCheckpoint.distanceFromStart, sequence.lastCheckpoint.altitude),
            );

            sequence.addCheckpointFromStep(descentSegment, VerticalCheckpointReason.CrossingFcuAltitudeDescent);
        }

        return sequence;
    }

    private handleSpeedConstraint(sequence: TemporaryCheckpointSequence, constraint: MaxSpeedConstraint, descentStrategy: DescentStrategy, windProfile: HeadwindProfile) {
        if (sequence.lastCheckpoint.speed <= constraint.maxSpeed && sequence.lastCheckpoint.distanceFromStart > constraint.distanceFromStart) {
            return;
        }

        const { managedDescentSpeedMach } = this.observer.get();

        const distanceToConstraint = constraint.distanceFromStart - sequence.lastCheckpoint.distanceFromStart;
        const maxDecelerationDistance = Math.min(distanceToConstraint, 20);

        let descentSegment: StepResults = null;
        let decelerationSegment: StepResults = null;

        const tryDecelDistance = (decelerationSegmentDistance: NauticalMiles): NauticalMiles => {
            descentSegment = descentStrategy.predictToDistance(
                sequence.lastCheckpoint.altitude,
                distanceToConstraint - decelerationSegmentDistance,
                sequence.lastCheckpoint.speed,
                managedDescentSpeedMach,
                sequence.lastCheckpoint.remainingFuelOnBoard,
                windProfile.getHeadwindComponent(sequence.lastCheckpoint.distanceFromStart, sequence.lastCheckpoint.altitude),
            );

            decelerationSegment = descentStrategy.predictToSpeed(
                descentSegment.finalAltitude,
                constraint.maxSpeed,
                descentSegment.speed,
                managedDescentSpeedMach,
                sequence.lastCheckpoint.remainingFuelOnBoard - descentSegment.fuelBurned,
                windProfile.getHeadwindComponent(sequence.lastCheckpoint.distanceFromStart + descentSegment.distanceTraveled, descentSegment.finalAltitude),
            );

            const totalDistanceTravelled = sequence.lastCheckpoint.distanceFromStart + descentSegment.distanceTraveled + decelerationSegment.distanceTraveled;
            const distanceOvershoot = totalDistanceTravelled - distanceToConstraint;

            return distanceOvershoot;
        };

        const a = 0;
        const b = maxDecelerationDistance;

        bisectionMethod(tryDecelDistance, a, b);

        sequence.addCheckpointFromStep(descentSegment, VerticalCheckpointReason.AtmosphericConditions);
        sequence.addCheckpointFromStep(decelerationSegment, VerticalCheckpointReason.SpeedConstraint);
    }
}

function bisectionMethod(f: (c: number) => number, a: number, b: number, errorTolerance: [number, number] = [-0.05, 0.05], maxIterations: number = 10): number {
    let fa = f(a);
    if (fa > 0) {
        let i = 0;
        while (i++ < maxIterations) {
            const c = (a + b) / 2;
            const fc = f(c);

            if (fc >= errorTolerance[0] || fc <= errorTolerance[1]) {
                if (VnavConfig.DEBUG_PROFILE) {
                    console.log(`[FMS/VNAV] Final error ${fc} after ${i} iterations.`);
                }

                return c;
            }

            if (fa * fc > 0) {
                a = c;
            } else {
                b = c;
            }

            fa = f(a);
        }
    }

    return a;
}
