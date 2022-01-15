import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { Constants } from '@shared/Constants';
import { ArmedVerticalMode, VerticalMode } from '@shared/autopilot';
import { ClimbStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
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

        this.addSpeedConstraintsAsCheckpoints(profile);
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

            if (constraintAltitude > profile.lastCheckpoint.altitude) {
                // Continue climb
                if (profile.lastCheckpoint.reason === VerticalCheckpointReason.AltitudeConstraint) {
                    profile.lastCheckpoint.reason = VerticalCheckpointReason.ContinueClimb;
                }

                this.buildIteratedClimbSegment(profile, climbStrategy, speedProfile, profile.lastCheckpoint.altitude, constraintAltitude);

                // We reach the target altitude before the constraint, so we insert a level segment.
                if (profile.lastCheckpoint.distanceFromStart < constraintDistanceFromStart) {
                    profile.lastCheckpoint.reason = VerticalCheckpointReason.LevelOffForConstraint;

                    this.addLevelSegmentSteps(profile, speedProfile, constraintDistanceFromStart);
                }
            } else if (Math.abs(profile.lastCheckpoint.altitude - constraintAltitude) < 1) {
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

        for (let altitude = startingAltitude; altitude < targetAltitude; altitude = Math.min(altitude + 1500, targetAltitude)) {
            const lastCheckpoint = profile.lastCheckpoint;

            const climbSpeed = speedProfile.get(lastCheckpoint.distanceFromStart, altitude);

            const targetAltitudeForSegment = Math.min(altitude + 1500, targetAltitude);
            const remainingFuelOnBoard = lastCheckpoint.remainingFuelOnBoard;

            const { distanceTraveled, fuelBurned, timeElapsed } = climbStrategy.predictClimb(altitude, targetAltitudeForSegment, climbSpeed, managedClimbSpeedMach, remainingFuelOnBoard);

            profile.checkpoints.push({
                reason: VerticalCheckpointReason.AtmosphericConditions,
                distanceFromStart: lastCheckpoint.distanceFromStart + distanceTraveled,
                secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
                altitude: targetAltitudeForSegment,
                remainingFuelOnBoard: remainingFuelOnBoard - fuelBurned,
                speed: speedProfile.get(lastCheckpoint.distanceFromStart + distanceTraveled, targetAltitudeForSegment),
            });
        }
    }

    private addLevelSegmentSteps(profile: BaseGeometryProfile, speedProfile: SpeedProfile, toDistanceFromStart: NauticalMiles): void {
        // The only reason we have to build this iteratively is because there could be speed constraints along the way
        const altitude = profile.lastCheckpoint.altitude;

        const distanceAlongPath = profile.lastCheckpoint.distanceFromStart;

        // Go over all constraints
        for (const speedConstraint of profile.maxSpeedConstraints) {
            const lastCheckpoint = profile.lastCheckpoint;

            // Ignore constraint since we're already past it
            if (distanceAlongPath >= speedConstraint.distanceFromStart || toDistanceFromStart <= speedConstraint.distanceFromStart) {
                continue;
            }

            const { fuelBurned, timeElapsed } = this.computeLevelFlightSegmentPrediction(
                speedConstraint.distanceFromStart - lastCheckpoint.distanceFromStart,
                altitude,
                speedProfile.get(lastCheckpoint.distanceFromStart, altitude),
                lastCheckpoint.remainingFuelOnBoard,
            );

            profile.checkpoints.push({
                reason: VerticalCheckpointReason.AltitudeConstraint,
                distanceFromStart: speedConstraint.distanceFromStart,
                secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
                altitude,
                remainingFuelOnBoard: lastCheckpoint.remainingFuelOnBoard - fuelBurned,
                speed: speedProfile.get(speedConstraint.distanceFromStart, altitude),
            });
        }

        // Move from last constraint to target distance from start
        const lastCheckpoint = profile.lastCheckpoint;

        const { fuelBurned, timeElapsed } = this.computeLevelFlightSegmentPrediction(
            toDistanceFromStart - lastCheckpoint.distanceFromStart,
            altitude,
            speedProfile.get(lastCheckpoint.distanceFromStart, altitude),
            lastCheckpoint.remainingFuelOnBoard,
        );

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.AltitudeConstraint,
            distanceFromStart: toDistanceFromStart,
            secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
            altitude,
            remainingFuelOnBoard: lastCheckpoint.remainingFuelOnBoard - fuelBurned,
            speed: speedProfile.get(toDistanceFromStart, altitude),
        });
    }

    private computeLevelFlightSegmentPrediction(stepSize: Feet, altitude: Feet, speed: Knots, fuelWeight: number): StepResults {
        const { zeroFuelWeight, managedClimbSpeedMach } = this.computationParametersObserver.get();

        return Predictions.levelFlightStep(
            altitude,
            stepSize,
            speed,
            managedClimbSpeedMach,
            zeroFuelWeight * Constants.TONS_TO_POUNDS,
            fuelWeight,
            0,
            this.atmosphericConditions.isaDeviation,
        );
    }

    private addSpeedConstraintsAsCheckpoints(profile: BaseGeometryProfile): void {
        for (const { distanceFromStart, maxSpeed } of profile.maxSpeedConstraints) {
            profile.addInterpolatedCheckpoint(distanceFromStart, { reason: VerticalCheckpointReason.SpeedConstraint, speed: maxSpeed });
        }
    }

    addSpeedLimitAsCheckpoint(profile: BaseGeometryProfile, speedProfile: SpeedProfile) {
        const { speedLimit: { underAltitude }, presentPosition: { alt }, cruiseAltitude } = this.computationParametersObserver.get();

        if (underAltitude <= alt || underAltitude > cruiseAltitude) {
            return;
        }

        const distance = profile.interpolateDistanceAtAltitude(underAltitude);

        profile.addInterpolatedCheckpoint(distance, { reason: VerticalCheckpointReason.CrossingSpeedLimit, speed: speedProfile.get(distance, underAltitude - 1) });
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
