import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { Constants } from '@shared/Constants';
import { ArmedVerticalMode, VerticalMode } from '@shared/autopilot';
import { EngineModel } from '../EngineModel';
import { FlapConf } from '../common';
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
    computeClimbPath(profile: BaseGeometryProfile, speedProfile: SpeedProfile, targetAltitude: Feet) {
        const { fcuVerticalMode, fcuArmedVerticalMode } = this.computationParametersObserver.get();

        this.addClimbSteps(profile, speedProfile, targetAltitude, VerticalCheckpointReason.TopOfClimb);

        if (this.shouldAddFcuAltAsCheckpoint(fcuVerticalMode, fcuArmedVerticalMode)) {
            this.addFcuAltitudeAsCheckpoint(profile);
        }

        if (speedProfile.shouldTakeSpeedLimitIntoAccount()) {
            this.addSpeedLimitAsCheckpoint(profile);
        }

        this.addSpeedConstraintsAsCheckpoints(profile);
    }

    private addClimbSteps(
        profile: BaseGeometryProfile, speedProfile: SpeedProfile, finalAltitude: Feet, finalAltitudeReason: VerticalCheckpointReason = VerticalCheckpointReason.AtmosphericConditions,
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

                this.buildIteratedClimbSegment(profile, speedProfile, profile.lastCheckpoint.altitude, constraintAltitude);

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

        this.buildIteratedClimbSegment(profile, speedProfile, profile.lastCheckpoint.altitude, finalAltitude);
        profile.lastCheckpoint.reason = finalAltitudeReason;
    }

    private buildIteratedClimbSegment(profile: BaseGeometryProfile, speedProfile: SpeedProfile, startingAltitude: Feet, targetAltitude: Feet): void {
        for (let altitude = startingAltitude; altitude < targetAltitude; altitude = Math.min(altitude + 1500, targetAltitude)) {
            const lastCheckpoint = profile.lastCheckpoint;

            const climbSpeed = speedProfile.get(lastCheckpoint.distanceFromStart, altitude);

            const targetAltitudeForSegment = Math.min(altitude + 1500, targetAltitude);
            const remainingFuelOnBoard = lastCheckpoint.remainingFuelOnBoard;

            const { distanceTraveled, fuelBurned, timeElapsed } = this.computeClimbSegmentPrediction(altitude, targetAltitudeForSegment, climbSpeed, remainingFuelOnBoard);

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

    /**
     * Computes predictions for a single segment using the atmospheric conditions in the middle. Use `buildIteratedClimbSegment` for longer climb segments.
     * @param startingAltitude Altitude at the start of climb
     * @param targetAltitude Altitude to terminate the climb
     * @param climbSpeed
     * @param remainingFuelOnBoard Remainging fuel on board at the start of the climb
     * @returns
     */
    private computeClimbSegmentPrediction(startingAltitude: Feet, targetAltitude: Feet, climbSpeed: Knots, remainingFuelOnBoard: number): StepResults {
        const { zeroFuelWeight, perfFactor, tropoPause } = this.computationParametersObserver.get();

        const midwayAltitudeClimb = (startingAltitude + targetAltitude) / 2;
        // TODO: Use actual value
        const machClimb = 0.76;

        const estimatedTat = this.atmosphericConditions.totalAirTemperatureFromMach(midwayAltitudeClimb, machClimb);
        const predictedN1 = this.getClimbThrustN1Limit(estimatedTat, midwayAltitudeClimb);

        return Predictions.altitudeStep(
            startingAltitude,
            targetAltitude - startingAltitude,
            climbSpeed,
            machClimb,
            predictedN1,
            zeroFuelWeight * Constants.TONS_TO_POUNDS,
            remainingFuelOnBoard,
            0,
            this.atmosphericConditions.isaDeviation,
            tropoPause,
            false,
            FlapConf.CLEAN,
            perfFactor,
        );
    }

    private computeLevelFlightSegmentPrediction(stepSize: Feet, altitude: Feet, speed: Knots, fuelWeight: number): StepResults {
        const { zeroFuelWeight } = this.computationParametersObserver.get();
        // TODO: Use actual value
        const machClimb = 0.76;

        return Predictions.levelFlightStep(
            altitude,
            stepSize,
            speed,
            machClimb,
            zeroFuelWeight * Constants.TONS_TO_POUNDS,
            fuelWeight,
            0,
            this.atmosphericConditions.isaDeviation,
        );
    }

    private getClimbThrustN1Limit(tat: number, pressureAltitude: Feet) {
        return EngineModel.tableInterpolation(EngineModel.maxClimbThrustTableLeap, tat, pressureAltitude);
    }

    private addSpeedConstraintsAsCheckpoints(profile: BaseGeometryProfile): void {
        for (const { distanceFromStart, maxSpeed } of profile.maxSpeedConstraints) {
            profile.addInterpolatedCheckpoint(distanceFromStart, { reason: VerticalCheckpointReason.SpeedConstraint, speed: maxSpeed });
        }
    }

    addSpeedLimitAsCheckpoint(profile: BaseGeometryProfile) {
        const { speedLimit: { underAltitude }, presentPosition: { alt }, cruiseAltitude } = this.computationParametersObserver.get();

        if (underAltitude <= alt || underAltitude > cruiseAltitude) {
            return;
        }

        const distance = profile.interpolateDistanceAtAltitude(underAltitude);

        profile.addInterpolatedCheckpoint(distance, { reason: VerticalCheckpointReason.CrossingSpeedLimit });
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
