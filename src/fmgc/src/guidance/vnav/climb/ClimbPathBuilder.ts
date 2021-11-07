import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { Constants } from '@shared/Constants';
import { ArmedVerticalMode, VerticalMode } from '@shared/autopilot';
import { ClimbStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
import { EngineModel } from '@fmgc/guidance/vnav/EngineModel';
import { Predictions, StepResults } from '../Predictions';
import { VerticalCheckpointReason } from '../profile/NavGeometryProfile';
import { BaseGeometryProfile } from '../profile/BaseGeometryProfile';
import { AtmosphericConditions } from '../AtmosphericConditions';

export class ClimbPathBuilder {
    constructor(private computationParametersObserver: VerticalProfileComputationParametersObserver, private atmosphericConditions: AtmosphericConditions) { }

    /**
     * Compute climb profile assuming climb thrust until top of climb. This does not care if we're below acceleration/thrust reduction altitude.
     * @param profile
     * @returns
     */
    computeClimbPath(profile: BaseGeometryProfile, climbStrategy: ClimbStrategy, speedProfile: SpeedProfile, targetAltitude: Feet) {
        const { fcuVerticalMode, fcuArmedVerticalMode } = this.computationParametersObserver.get();

        this.addClimbSteps(profile, climbStrategy, speedProfile, targetAltitude, VerticalCheckpointReason.TopOfClimb);

        if (this.shouldAddFcuAltAsCheckpoint(fcuVerticalMode, fcuArmedVerticalMode)) {
            this.addFcuAltitudeAsCheckpoint(profile);
        }

        if (speedProfile.shouldTakeSpeedLimitIntoAccount()) {
            this.addSpeedLimitAsCheckpoint(profile, speedProfile);
        }

        // this.addSpeedConstraintsAsCheckpoints(profile);
    }

    private addClimbSteps(
        profile: BaseGeometryProfile,
        climbStrategy: ClimbStrategy,
        speedProfile: SpeedProfile,
        finalAltitude: Feet,
        finalAltitudeReason: VerticalCheckpointReason = VerticalCheckpointReason.AtmosphericConditions,
    ) {
        for (const constraint of profile.maxAltitudeConstraints) {
            const { maxAltitude: constraintAltitude, distanceFromStart: constraintDistanceFromStart } = constraint;

            if (constraintAltitude >= finalAltitude) {
                break;
            }

            // Code is WIP. Idea is to make ClimbPathBuilder more aware of speed constraints,
            // so we can properly integrate acceleration segments

            if (constraintAltitude > profile.lastCheckpoint.altitude) {
                // Continue climb
                if (profile.lastCheckpoint.reason === VerticalCheckpointReason.AltitudeConstraint) {
                    profile.lastCheckpoint.reason = VerticalCheckpointReason.ContinueClimb;
                }

                // Mark where we are
                let indexToResetTo = profile.checkpoints.length;
                // Try going to the next altitude
                this.buildIteratedClimbSegment(profile, climbStrategy, speedProfile, profile.lastCheckpoint.altitude, constraintAltitude);

                let currentSpeedConstraint = speedProfile.getMaxClimbSpeedConstraint(profile.lastCheckpoint.distanceFromStart);
                for (let i = 0; i++ < 10 && currentSpeedConstraint; currentSpeedConstraint = speedProfile.getMaxClimbSpeedConstraint(profile.lastCheckpoint.distanceFromStart)) {
                    // This means we did not pass a constraint during the climb
                    if (currentSpeedConstraint.distanceFromStart > profile.lastCheckpoint.distanceFromStart) {
                        break;
                    }

                    // Reset
                    profile.checkpoints.splice(indexToResetTo);

                    // Use distance step instead
                    this.distanceStepFromLastCheckpoint(
                        profile,
                        climbStrategy,
                        currentSpeedConstraint.distanceFromStart - profile.lastCheckpoint.distanceFromStart,
                        VerticalCheckpointReason.SpeedConstraint,
                    );

                    // Repeat
                    indexToResetTo = profile.checkpoints.length;
                    this.buildIteratedClimbSegment(profile, climbStrategy, speedProfile, profile.lastCheckpoint.altitude, constraintAltitude);
                }

                // We reach the target altitude before the constraint, so we insert a level segment.
                if (profile.lastCheckpoint.distanceFromStart < constraintDistanceFromStart) {
                    profile.lastCheckpoint.reason = VerticalCheckpointReason.LevelOffForConstraint;

                    this.addLevelSegmentSteps(profile, speedProfile, constraintDistanceFromStart);
                }
            } else if (Math.abs(profile.lastCheckpoint.altitude - constraintAltitude) < 250) {
                // Continue in level flight to the next constraint
                this.addLevelSegmentSteps(profile, speedProfile, constraintDistanceFromStart);
            }
        }

        if (profile.lastCheckpoint.reason === VerticalCheckpointReason.AltitudeConstraint) {
            profile.lastCheckpoint.reason = VerticalCheckpointReason.ContinueClimb;
        }

        this.buildIteratedClimbSegment(profile, climbStrategy, speedProfile, profile.lastCheckpoint.altitude, finalAltitude);
        profile.lastCheckpoint.reason = finalAltitudeReason;
    }

    private buildIteratedClimbSegment(profile: BaseGeometryProfile, climbStrategy: ClimbStrategy, speedProfile: SpeedProfile, startingAltitude: Feet, targetAltitude: Feet): void {
        const { managedClimbSpeedMach } = this.computationParametersObserver.get();

        for (let altitude = startingAltitude; altitude < targetAltitude;) {
            const lastCheckpoint = profile.lastCheckpoint;

            const lastClimbSpeed = lastCheckpoint.speed;
            const climbSpeed = speedProfile.getTarget(lastCheckpoint.distanceFromStart, altitude);
            const remainingFuelOnBoard = lastCheckpoint.remainingFuelOnBoard;

            const step = Math.abs(climbSpeed - lastClimbSpeed) < 1
                ? climbStrategy.predictToAltitude(altitude, Math.min(altitude + 1500, targetAltitude), climbSpeed, managedClimbSpeedMach, remainingFuelOnBoard)
                : climbStrategy.predictToSpeed(altitude, climbSpeed, lastClimbSpeed, managedClimbSpeedMach, remainingFuelOnBoard);

            const { distanceTraveled, timeElapsed, fuelBurned, finalAltitude, speed } = step;

            profile.checkpoints.push({
                reason: VerticalCheckpointReason.AtmosphericConditions,
                distanceFromStart: lastCheckpoint.distanceFromStart + distanceTraveled,
                secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
                altitude: finalAltitude,
                remainingFuelOnBoard: remainingFuelOnBoard - fuelBurned,
                speed,
            });

            altitude = finalAltitude;
        }
    }

    private distanceStepFromLastCheckpoint(profile: BaseGeometryProfile, climbStrategy: ClimbStrategy, distance: NauticalMiles, reason: VerticalCheckpointReason) {
        const { managedClimbSpeedMach } = this.computationParametersObserver.get();
        const { altitude, speed: initialSpeed, remainingFuelOnBoard, distanceFromStart, secondsFromPresent } = profile.lastCheckpoint;

        const {
            distanceTraveled,
            timeElapsed,
            finalAltitude,
            fuelBurned,
            speed,
        } = climbStrategy.predictToDistance(altitude, distance, initialSpeed, managedClimbSpeedMach, remainingFuelOnBoard);

        profile.checkpoints.push({
            reason,
            distanceFromStart: distanceFromStart + distanceTraveled,
            secondsFromPresent: secondsFromPresent + (timeElapsed * 60),
            altitude: finalAltitude,
            remainingFuelOnBoard: remainingFuelOnBoard - fuelBurned,
            speed,
        });
    }

    private addLevelSegmentSteps(profile: BaseGeometryProfile, speedProfile: SpeedProfile, toDistanceFromStart: NauticalMiles): void {
        // The only reason we have to build this iteratively is because there could be speed constraints along the way
        const altitude = profile.lastCheckpoint.altitude;

        // Go over all constraints
        for (const speedConstraint of profile.maxClimbSpeedConstraints) {
            // Ignore constraint since we're already past it
            if (profile.lastCheckpoint.distanceFromStart >= speedConstraint.distanceFromStart || toDistanceFromStart <= speedConstraint.distanceFromStart) {
                continue;
            }

            const currentSpeed = profile.lastCheckpoint.speed;
            const speedTarget = speedProfile.getTarget(profile.lastCheckpoint.distanceFromStart, altitude);

            if (speedTarget > currentSpeed) {
                const {
                    distanceTraveled,
                    timeElapsed,
                    fuelBurned,
                    speed,
                } = this.computeLevelFlightAccelerationStep(altitude, currentSpeed, speedTarget, profile.lastCheckpoint.remainingFuelOnBoard);

                // We could not accelerate in time
                if (profile.lastCheckpoint.distanceFromStart + distanceTraveled > speedConstraint.distanceFromStart) {
                    const scaling = distanceTraveled / (speedConstraint.distanceFromStart - profile.lastCheckpoint.distanceFromStart);

                    profile.checkpoints.push({
                        reason: VerticalCheckpointReason.AtmosphericConditions,
                        distanceFromStart: speedConstraint.distanceFromStart,
                        secondsFromPresent: profile.lastCheckpoint.secondsFromPresent + (timeElapsed * scaling * 60),
                        altitude,
                        remainingFuelOnBoard: profile.lastCheckpoint.remainingFuelOnBoard - fuelBurned * scaling,
                        speed: speed * scaling,
                    });

                    continue;
                } else {
                    // End of acceleration
                    profile.checkpoints.push({
                        reason: VerticalCheckpointReason.AtmosphericConditions,
                        distanceFromStart: profile.lastCheckpoint.distanceFromStart + distanceTraveled,
                        secondsFromPresent: profile.lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
                        altitude,
                        remainingFuelOnBoard: profile.lastCheckpoint.remainingFuelOnBoard - fuelBurned,
                        speed,
                    });
                }
            }

            // Compute step after accelerating to next constraint
            const { fuelBurned, timeElapsed } = this.computeLevelFlightSegmentPrediction(
                speedConstraint.distanceFromStart - profile.lastCheckpoint.distanceFromStart,
                altitude,
                profile.lastCheckpoint.speed,
                profile.lastCheckpoint.remainingFuelOnBoard,
            );

            profile.checkpoints.push({
                reason: VerticalCheckpointReason.AltitudeConstraint,
                distanceFromStart: speedConstraint.distanceFromStart,
                secondsFromPresent: profile.lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
                altitude,
                remainingFuelOnBoard: profile.lastCheckpoint.remainingFuelOnBoard - fuelBurned,
                speed: profile.lastCheckpoint.speed,
            });
        }

        const currentSpeed = profile.lastCheckpoint.speed;
        const speedTarget = speedProfile.getTarget(profile.lastCheckpoint.distanceFromStart, altitude);

        if (speedTarget > currentSpeed) {
            const {
                distanceTraveled,
                timeElapsed,
                fuelBurned,
                speed,
            } = this.computeLevelFlightAccelerationStep(altitude, currentSpeed, speedTarget, profile.lastCheckpoint.remainingFuelOnBoard);

            // We could not accelerate in time
            if (profile.lastCheckpoint.distanceFromStart + distanceTraveled > toDistanceFromStart) {
                const scaling = distanceTraveled / (toDistanceFromStart - profile.lastCheckpoint.distanceFromStart);

                profile.checkpoints.push({
                    reason: VerticalCheckpointReason.AtmosphericConditions,
                    distanceFromStart: toDistanceFromStart,
                    secondsFromPresent: profile.lastCheckpoint.secondsFromPresent + (timeElapsed * scaling * 60),
                    altitude,
                    remainingFuelOnBoard: profile.lastCheckpoint.remainingFuelOnBoard - fuelBurned * scaling,
                    speed: speed * scaling,
                });

                return;
            }
            // End of acceleration
            profile.checkpoints.push({
                reason: VerticalCheckpointReason.AtmosphericConditions,
                distanceFromStart: profile.lastCheckpoint.distanceFromStart + distanceTraveled,
                secondsFromPresent: profile.lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
                altitude,
                remainingFuelOnBoard: profile.lastCheckpoint.remainingFuelOnBoard - fuelBurned,
                speed,
            });
        }

        const step = this.computeLevelFlightSegmentPrediction(
            toDistanceFromStart - profile.lastCheckpoint.distanceFromStart,
            altitude,
            profile.lastCheckpoint.speed,
            profile.lastCheckpoint.remainingFuelOnBoard,
        );

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.AltitudeConstraint,
            distanceFromStart: toDistanceFromStart,
            secondsFromPresent: profile.lastCheckpoint.secondsFromPresent + (step.timeElapsed * 60),
            altitude,
            remainingFuelOnBoard: profile.lastCheckpoint.remainingFuelOnBoard - step.fuelBurned,
            speed: profile.lastCheckpoint.speed,
        });
    }

    private computeLevelFlightSegmentPrediction(stepSize: Feet, altitude: Feet, initialSpeed: Knots, fuelWeight: number): StepResults {
        const { zeroFuelWeight, managedClimbSpeedMach } = this.computationParametersObserver.get();

        return Predictions.levelFlightStep(
            altitude,
            stepSize,
            initialSpeed,
            managedClimbSpeedMach,
            zeroFuelWeight,
            fuelWeight,
            0,
            this.atmosphericConditions.isaDeviation,
        );
    }

    private computeLevelFlightAccelerationStep(altitude: Feet, initialSpeed: Knots, speedTarget: Knots, fuelWeight: number): StepResults {
        const { zeroFuelWeight, managedClimbSpeedMach, tropoPause } = this.computationParametersObserver.get();

        return Predictions.speedChangeStep(
            0,
            altitude,
            initialSpeed,
            speedTarget,
            managedClimbSpeedMach,
            managedClimbSpeedMach,
            getClimbThrustN1Limit(this.atmosphericConditions, altitude, (initialSpeed + speedTarget) / 2), // TOD0
            zeroFuelWeight * Constants.TONS_TO_POUNDS,
            fuelWeight,
            0,
            this.atmosphericConditions.isaDeviation,
            tropoPause,
        );
    }

    private addSpeedConstraintsAsCheckpoints(profile: BaseGeometryProfile): void {
        for (const { distanceFromStart, maxSpeed } of profile.maxClimbSpeedConstraints) {
            profile.addInterpolatedCheckpoint(distanceFromStart, { reason: VerticalCheckpointReason.SpeedConstraint, speed: maxSpeed });
        }
    }

    addSpeedLimitAsCheckpoint(profile: BaseGeometryProfile, speedProfile: SpeedProfile) {
        const { climbSpeedLimit: { underAltitude }, presentPosition: { alt }, cruiseAltitude } = this.computationParametersObserver.get();

        if (underAltitude <= alt || underAltitude > cruiseAltitude) {
            return;
        }

        const distance = profile.interpolateDistanceAtAltitude(underAltitude);

        profile.addInterpolatedCheckpoint(distance, { reason: VerticalCheckpointReason.CrossingSpeedLimit, speed: speedProfile.getTarget(distance, underAltitude - 1) });
    }

    private addFcuAltitudeAsCheckpoint(profile: BaseGeometryProfile) {
        const { fcuAltitude, presentPosition, cruiseAltitude } = this.computationParametersObserver.get();

        if (fcuAltitude <= presentPosition.alt || fcuAltitude > cruiseAltitude) {
            return;
        }

        const distance = profile.interpolateDistanceAtAltitude(fcuAltitude);

        profile.addInterpolatedCheckpoint(distance, { reason: VerticalCheckpointReason.CrossingFcuAltitude });
    }

    private shouldAddFcuAltAsCheckpoint(verticalMode: VerticalMode, armedVerticalMode: ArmedVerticalMode) {
        const verticalModesToShowLevelOffArrowFor = [
            VerticalMode.OP_CLB,
            VerticalMode.VS,
            VerticalMode.FPA,
            VerticalMode.CLB,
            VerticalMode.SRS,
            VerticalMode.SRS_GA,
        ];

        return ((armedVerticalMode & ArmedVerticalMode.CLB) === ArmedVerticalMode.CLB) || verticalModesToShowLevelOffArrowFor.includes(verticalMode);
    }
}

// TODO: Deduplicate this from here and ClimbStrategy.ts
function getClimbThrustN1Limit(atmosphericConditions: AtmosphericConditions, altitude: Feet, speed: Knots) {
    // This Mach number is the Mach number for the predicted climb speed, not the Mach to use after crossover altitude.
    const climbSpeedMach = atmosphericConditions.computeMachFromCas(altitude, speed);
    const estimatedTat = atmosphericConditions.totalAirTemperatureFromMach(altitude, climbSpeedMach);

    return EngineModel.tableInterpolation(EngineModel.maxClimbThrustTableLeap, estimatedTat, altitude);
}
