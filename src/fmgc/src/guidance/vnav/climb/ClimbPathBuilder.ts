import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { VerticalMode } from '@shared/autopilot';
import { ClimbSpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { EngineModel } from '../EngineModel';
import { FlapConf } from '../common';
import { Predictions, StepResults } from '../Predictions';
import { MaxAltitudeConstraint, VerticalCheckpointReason } from '../profile/NavGeometryProfile';
import { BaseGeometryProfile } from '../profile/BaseGeometryProfile';
import { AtmosphericConditions } from '../AtmosphericConditions';

export class ClimbPathBuilder {
    private static TONS_TO_POUNDS = 2204.62;

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

    private verticalModesToApplyAltitudeConstraintsFor: VerticalMode[] = [
        VerticalMode.ALT_CPT,
        VerticalMode.ALT_CST_CPT,
        VerticalMode.CLB,
        VerticalMode.ALT_CST,
    ]

    private atmosphericConditions: AtmosphericConditions = new AtmosphericConditions();

    constructor(private computationParametersObserver: VerticalProfileComputationParametersObserver, private speedProfile: ClimbSpeedProfile) { }

    update() {
        this.atmosphericConditions.update();
    }

    computeClimbPath(profile: BaseGeometryProfile) {
        const isOnGround = SimVar.GetSimVarValue('SIM ON GROUND', 'Bool');

        const { fcuVerticalMode } = this.computationParametersObserver.get();

        if (!isOnGround) {
            if (this.verticalModesToComputeProfileFor.includes(fcuVerticalMode)) {
                this.computeLivePrediction(profile);
            }

            return;
        }

        this.computePreflightPrediction(profile);
    }

    computePreflightPrediction(profile: BaseGeometryProfile) {
        const { fuelOnBoard, originAirfieldElevation, thrustReductionAltitude, accelerationAltitude, cruiseAltitude, speedLimit, v2Speed } = this.computationParametersObserver.get();

        this.addTakeoffRollCheckpoint(profile, fuelOnBoard * ClimbPathBuilder.TONS_TO_POUNDS);
        this.addTakeoffStepCheckpoint(profile, originAirfieldElevation, thrustReductionAltitude);
        this.addAccelerationAltitudeStep(profile, thrustReductionAltitude, accelerationAltitude, v2Speed + 10);

        if (speedLimit.underAltitude > accelerationAltitude && speedLimit.underAltitude < cruiseAltitude) {
            this.addClimbSteps(profile, speedLimit.underAltitude, VerticalCheckpointReason.CrossingSpeedLimit);
        }

        this.addClimbSteps(profile, cruiseAltitude, VerticalCheckpointReason.TopOfClimb);
        this.addSpeedConstraintsAsCheckpoints(profile);
    }

    /**
     * Compute climb profile assuming climb thrust until top of climb. This does not care if we're below acceleration/thrust reduction altitude.
     * @param profile
     * @returns
     */
    computeLivePrediction(profile: BaseGeometryProfile) {
        const { presentPosition, cruiseAltitude, speedLimit } = this.computationParametersObserver.get();

        this.addPresentPositionCheckpoint(profile, presentPosition.alt);
        if (speedLimit.underAltitude > presentPosition.alt && speedLimit.underAltitude < cruiseAltitude) {
            this.addClimbSteps(profile, speedLimit.underAltitude, VerticalCheckpointReason.CrossingSpeedLimit);
        }

        this.addClimbSteps(profile, cruiseAltitude, VerticalCheckpointReason.TopOfClimb);
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

    private addClimbSteps(profile: BaseGeometryProfile, finalAltitude: Feet, finalAltitudeReason: VerticalCheckpointReason = VerticalCheckpointReason.AtmosphericConditions) {
        const constraints = this.getAltitudeConstraintsForVerticalMode(profile);

        for (const constraint of constraints) {
            const { maxAltitude: constraintAltitude, distanceFromStart: constraintDistanceFromStart } = constraint;

            if (constraintAltitude >= finalAltitude) {
                break;
            }

            if (constraintAltitude > profile.lastCheckpoint.altitude) {
                // Continue climb
                if (profile.lastCheckpoint.reason === VerticalCheckpointReason.WaypointWithConstraint) {
                    profile.lastCheckpoint.reason = VerticalCheckpointReason.ContinueClimb;
                }

                this.buildIteratedClimbSegment(profile, profile.lastCheckpoint.altitude, constraintAltitude);

                // We reach the target altitude before the constraint, so we insert a level segment.
                if (profile.lastCheckpoint.distanceFromStart < constraintDistanceFromStart) {
                    profile.lastCheckpoint.reason = VerticalCheckpointReason.LevelOffForConstraint;

                    this.addLevelSegmentSteps(profile, constraintDistanceFromStart);
                }
            } else if (Math.abs(profile.lastCheckpoint.altitude - constraintAltitude) < 1) {
                // Continue in level flight to the next constraint
                this.addLevelSegmentSteps(profile, constraintDistanceFromStart);
            }
        }

        if (profile.lastCheckpoint.reason === VerticalCheckpointReason.WaypointWithConstraint) {
            profile.lastCheckpoint.reason = VerticalCheckpointReason.ContinueClimb;
        }

        this.buildIteratedClimbSegment(profile, profile.lastCheckpoint.altitude, finalAltitude);
        profile.lastCheckpoint.reason = finalAltitudeReason;
    }

    private buildIteratedClimbSegment(profile: BaseGeometryProfile, startingAltitude: Feet, targetAltitude: Feet): void {
        for (let altitude = startingAltitude; altitude < targetAltitude; altitude = Math.min(altitude + 1500, targetAltitude)) {
            const lastCheckpoint = profile.lastCheckpoint;

            const climbSpeed = this.speedProfile.getManaged(lastCheckpoint.distanceFromStart, altitude);

            const targetAltitudeForSegment = Math.min(altitude + 1500, targetAltitude);
            const remainingFuelOnBoard = lastCheckpoint.remainingFuelOnBoard;

            const { distanceTraveled, fuelBurned, timeElapsed } = this.computeClimbSegmentPrediction(altitude, targetAltitudeForSegment, climbSpeed, remainingFuelOnBoard);

            profile.checkpoints.push({
                reason: VerticalCheckpointReason.AtmosphericConditions,
                distanceFromStart: lastCheckpoint.distanceFromStart + distanceTraveled,
                secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
                altitude: targetAltitudeForSegment,
                remainingFuelOnBoard: remainingFuelOnBoard - fuelBurned,
                speed: this.speedProfile.getManaged(lastCheckpoint.distanceFromStart + distanceTraveled, targetAltitudeForSegment),
            });
        }
    }

    private addLevelSegmentSteps(profile: BaseGeometryProfile, toDistanceFromStart: NauticalMiles): void {
        const { managedClimbSpeed } = this.computationParametersObserver.get();

        // The only reason we have to build this iteratively is because there could be speed constraints along the way
        const altitude = profile.lastCheckpoint.altitude;

        let distanceAlongPath = profile.lastCheckpoint.distanceFromStart;

        // Go over all constraints
        for (const speedConstraint of profile.maxSpeedConstraints) {
            const lastCheckpoint = profile.lastCheckpoint;

            // Ignore constraint since we're already past it
            if (distanceAlongPath >= speedConstraint.distanceFromStart || toDistanceFromStart <= speedConstraint.distanceFromStart) {
                continue;
            }

            distanceAlongPath = speedConstraint.distanceFromStart;

            const speed = this.speedProfile.withSpeedLimitIfApplicable(altitude, speedConstraint.maxSpeed);

            const { fuelBurned, timeElapsed } = this.computeLevelFlightSegmentPrediction(
                distanceAlongPath - lastCheckpoint.distanceFromStart,
                altitude,
                speed,
                lastCheckpoint.remainingFuelOnBoard,
            );

            profile.checkpoints.push({
                reason: VerticalCheckpointReason.WaypointWithConstraint,
                distanceFromStart: distanceAlongPath,
                secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
                altitude,
                remainingFuelOnBoard: lastCheckpoint.remainingFuelOnBoard - fuelBurned,
                speed,
            });
        }

        // Move from last constraint to target distance from start
        // No need to check for a speed constraint here as we just iterated through all of them
        const speed = this.speedProfile.withSpeedLimitIfApplicable(altitude, managedClimbSpeed);
        const lastCheckpoint = profile.lastCheckpoint;

        const { fuelBurned, timeElapsed } = this.computeLevelFlightSegmentPrediction(
            toDistanceFromStart - lastCheckpoint.distanceFromStart,
            altitude,
            speed,
            lastCheckpoint.remainingFuelOnBoard,
        );

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.WaypointWithConstraint,
            distanceFromStart: toDistanceFromStart,
            secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
            altitude,
            remainingFuelOnBoard: lastCheckpoint.remainingFuelOnBoard - fuelBurned,
            speed,
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
        const machClimb = this.atmosphericConditions.computeMachFromCas(midwayAltitudeClimb, climbSpeed);

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
        const machClimb = this.atmosphericConditions.computeMachFromCas(altitude, speed);

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

    findMaxSpeedAtDistanceAlongTrack(distanceAlongTrack: NauticalMiles): Knots {
        return this.speedProfile.findMaxSpeedAtDistanceAlongTrack(distanceAlongTrack);
    }

    private addSpeedConstraintsAsCheckpoints(profile: BaseGeometryProfile): void {
        for (const { distanceFromStart, maxSpeed } of profile.maxSpeedConstraints) {
            profile.addSpeedCheckpoint(distanceFromStart, maxSpeed, VerticalCheckpointReason.SpeedConstraint);
        }
    }

    private getAltitudeConstraintsForVerticalMode(profile: BaseGeometryProfile): MaxAltitudeConstraint[] {
        const { fcuVerticalMode, flightPhase } = this.computationParametersObserver.get();

        if (flightPhase === FlightPhase.FLIGHT_PHASE_PREFLIGHT
            || this.verticalModesToApplyAltitudeConstraintsFor.includes(fcuVerticalMode)
        ) {
            return profile.maxAltitudeConstraints;
        }

        return [];
    }
}
