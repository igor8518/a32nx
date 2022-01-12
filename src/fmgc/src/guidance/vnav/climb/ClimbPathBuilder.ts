import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { VerticalMode } from '@shared/autopilot';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { EngineModel } from '../EngineModel';
import { FlapConf } from '../common';
import { Predictions, StepResults } from '../Predictions';
import { VerticalCheckpointReason } from '../profile/NavGeometryProfile';
import { BaseGeometryProfile } from '../profile/BaseGeometryProfile';
import { AtmosphericConditions } from '../AtmosphericConditions';

export class ClimbPathBuilder {
    static TONS_TO_POUNDS = 2204.62;

    private verticalModesToComputeProfileFor: VerticalMode[] = [
        VerticalMode.CLB,
        VerticalMode.OP_CLB,
        VerticalMode.VS,
        VerticalMode.ALT,
        VerticalMode.ALT_CPT,
        VerticalMode.ALT_CST_CPT,
        VerticalMode.ALT_CST,
        VerticalMode.SRS,
    ]

    private atmosphericConditions: AtmosphericConditions = new AtmosphericConditions();

    constructor(private computationParametersObserver: VerticalProfileComputationParametersObserver) { }

    update() {
        this.atmosphericConditions.update();
    }

    computeClimbPath(profile: BaseGeometryProfile, speedProfile: SpeedProfile, targetAltitude: Feet) {
        const isOnGround = SimVar.GetSimVarValue('SIM ON GROUND', 'Bool');

        const { fcuVerticalMode } = this.computationParametersObserver.get();

        if (!isOnGround) {
            if (this.verticalModesToComputeProfileFor.includes(fcuVerticalMode)) {
                this.computeLivePrediction(profile, speedProfile, targetAltitude);
            }

            return;
        }

        this.computePreflightPrediction(profile, speedProfile, targetAltitude);
    }

    computePreflightPrediction(profile: BaseGeometryProfile, speedProfile: SpeedProfile, targetAltitude: Feet) {
        const { fuelOnBoard, originAirfieldElevation, thrustReductionAltitude, accelerationAltitude, speedLimit, v2Speed } = this.computationParametersObserver.get();

        this.addTakeoffRollCheckpoint(profile, fuelOnBoard * ClimbPathBuilder.TONS_TO_POUNDS);
        this.addTakeoffStepCheckpoint(profile, originAirfieldElevation, thrustReductionAltitude);
        this.addAccelerationAltitudeStep(profile, thrustReductionAltitude, accelerationAltitude, v2Speed + 10);

        if (speedProfile.shouldTakeSpeedLimitIntoAccount() && speedLimit.underAltitude > accelerationAltitude && speedLimit.underAltitude < targetAltitude) {
            this.addClimbSteps(profile, speedProfile, speedLimit.underAltitude, VerticalCheckpointReason.CrossingSpeedLimit);
        }

        this.addClimbSteps(profile, speedProfile, targetAltitude, VerticalCheckpointReason.TopOfClimb);
        this.addFcuAltitudeAsCheckpoint(profile);
        this.addSpeedConstraintsAsCheckpoints(profile);
    }

    /**
     * Compute climb profile assuming climb thrust until top of climb. This does not care if we're below acceleration/thrust reduction altitude.
     * @param profile
     * @returns
     */
    computeLivePrediction(profile: BaseGeometryProfile, speedProfile: SpeedProfile, targetAltitude: Feet) {
        const { presentPosition, speedLimit } = this.computationParametersObserver.get();

        this.addPresentPositionCheckpoint(profile, presentPosition.alt);
        if (speedProfile.shouldTakeSpeedLimitIntoAccount() && speedLimit.underAltitude > presentPosition.alt && speedLimit.underAltitude < targetAltitude) {
            this.addClimbSteps(profile, speedProfile, speedLimit.underAltitude, VerticalCheckpointReason.CrossingSpeedLimit);
        }

        this.addClimbSteps(profile, speedProfile, targetAltitude, VerticalCheckpointReason.TopOfClimb);
        this.addFcuAltitudeAsCheckpoint(profile);
        this.addSpeedConstraintsAsCheckpoints(profile);
    }

    private addPresentPositionCheckpoint(profile: BaseGeometryProfile, altitude: Feet) {
        const distanceFromStart = profile.distanceToPresentPosition;

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.PresentPosition,
            distanceFromStart,
            secondsFromPresent: 0,
            altitude,
            remainingFuelOnBoard: this.computationParametersObserver.get().fuelOnBoard * ClimbPathBuilder.TONS_TO_POUNDS,
            speed: SimVar.GetSimVarValue('AIRSPEED INDICATED', 'knots'),
        });
    }

    private addTakeoffStepCheckpoint(profile: BaseGeometryProfile, groundAltitude: Feet, thrustReductionAltitude: Feet) {
        const { perfFactor, zeroFuelWeight, v2Speed, tropoPause } = this.computationParametersObserver.get();

        const midwayAltitudeSrs = (thrustReductionAltitude + groundAltitude) / 2;
        const predictedN1 = SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_THRUST_LIMIT_TOGA', 'Percent');
        const flapsSetting: FlapConf = SimVar.GetSimVarValue('L:A32NX_TO_CONFIG_FLAPS', 'Enum');
        const speed = v2Speed + 10;
        const machSrs = this.atmosphericConditions.computeMachFromCas(midwayAltitudeSrs, speed);

        const { fuelBurned, distanceTraveled, timeElapsed } = Predictions.altitudeStep(
            groundAltitude,
            thrustReductionAltitude - groundAltitude,
            speed,
            machSrs,
            predictedN1,
            zeroFuelWeight * ClimbPathBuilder.TONS_TO_POUNDS,
            profile.lastCheckpoint.remainingFuelOnBoard,
            0,
            this.atmosphericConditions.isaDeviation,
            tropoPause,
            false,
            flapsSetting,
            perfFactor,
        );

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.ThrustReductionAltitude,
            distanceFromStart: profile.lastCheckpoint.distanceFromStart + distanceTraveled,
            secondsFromPresent: profile.lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
            altitude: thrustReductionAltitude,
            remainingFuelOnBoard: profile.lastCheckpoint.remainingFuelOnBoard - fuelBurned,
            speed,
        });
    }

    private addAccelerationAltitudeStep(profile: BaseGeometryProfile, startingAltitude: Feet, targetAltitude: Feet, speed: Knots) {
        const lastCheckpoint = profile.lastCheckpoint;

        const { fuelBurned, distanceTraveled, timeElapsed } = this.computeClimbSegmentPrediction(startingAltitude, targetAltitude, speed, lastCheckpoint.remainingFuelOnBoard);

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.AccelerationAltitude,
            distanceFromStart: lastCheckpoint.distanceFromStart + distanceTraveled,
            secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
            altitude: this.computationParametersObserver.get().accelerationAltitude,
            remainingFuelOnBoard: lastCheckpoint.remainingFuelOnBoard - fuelBurned,
            speed,
        });
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
            zeroFuelWeight * ClimbPathBuilder.TONS_TO_POUNDS,
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
            zeroFuelWeight * ClimbPathBuilder.TONS_TO_POUNDS,
            fuelWeight,
            0,
            this.atmosphericConditions.isaDeviation,
        );
    }

    private getClimbThrustN1Limit(tat: number, pressureAltitude: Feet) {
        return EngineModel.tableInterpolation(EngineModel.maxClimbThrustTableLeap, tat, pressureAltitude);
    }

    private addTakeoffRollCheckpoint(profile: BaseGeometryProfile, remainingFuelOnBoard: number) {
        const { originAirfieldElevation, v2Speed } = this.computationParametersObserver.get();

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.Liftoff,
            distanceFromStart: 0.6,
            secondsFromPresent: 20,
            altitude: originAirfieldElevation,
            remainingFuelOnBoard,
            speed: v2Speed + 10, // I know this is not perfectly accurate
        });
    }

    private addSpeedConstraintsAsCheckpoints(profile: BaseGeometryProfile): void {
        for (const { distanceFromStart, maxSpeed } of profile.maxSpeedConstraints) {
            profile.addInterpolatedCheckpoint(distanceFromStart, { reason: VerticalCheckpointReason.SpeedConstraint, speed: maxSpeed });
        }
    }

    private addFcuAltitudeAsCheckpoint(profile: BaseGeometryProfile) {
        const { fcuAltitude, presentPosition, cruiseAltitude } = this.computationParametersObserver.get();

        if (fcuAltitude <= presentPosition.alt || fcuAltitude > cruiseAltitude) {
            return;
        }

        const distance = profile.interpolateDistanceAtAltitude(fcuAltitude);

        profile.addInterpolatedCheckpoint(distance, { reason: VerticalCheckpointReason.CrossingFcuAltitude });
    }
}
