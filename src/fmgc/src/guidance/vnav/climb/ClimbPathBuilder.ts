import { Geometry } from '@fmgc/guidance/Geometry';
import { VerticalProfileComputationParameters, VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { EngineModel } from '../EngineModel';
import { FlapConf } from '../common';
import { Predictions, StepResults } from '../Predictions';
import { GeometryProfile, VerticalCheckpointReason } from '../GeometryProfile';
import { AtmosphericConditions } from '../AtmosphericConditions';

export class ClimbPathBuilder {
    private static TONS_TO_POUNDS = 2240;

    private atmosphericConditions: AtmosphericConditions = new AtmosphericConditions();

    constructor(private computationParametersObserver: VerticalProfileComputationParametersObserver) { }

    update() {
        this.atmosphericConditions.update();
    }

    computeClimbPath(profile: GeometryProfile) {
        const isOnGround = SimVar.GetSimVarValue('SIM ON GROUND', 'Bool');

        const { fcuVerticalMode } = this.computationParametersObserver.get();

        if (!isOnGround) {
            if (fcuVerticalMode === 11 || fcuVerticalMode === 22) {
                this.computeLivePrediction(profile);
            }

            return;
        }

        this.computePreflightPrediction(profile);
    }

    computePreflightPrediction(profile: GeometryProfile) {
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
    computeLivePrediction(profile: GeometryProfile) {
        const { presentPosition, cruiseAltitude, speedLimit } = this.computationParametersObserver.get();

        this.addPresentPositionCheckpoint(profile, presentPosition.alt);
        if (speedLimit.underAltitude > presentPosition.alt && speedLimit.underAltitude < cruiseAltitude) {
            this.addClimbSteps(profile, speedLimit.underAltitude, VerticalCheckpointReason.CrossingSpeedLimit);
        }

        this.addClimbSteps(profile, cruiseAltitude, VerticalCheckpointReason.TopOfClimb);
        this.addSpeedConstraintsAsCheckpoints(profile);
    }

    private addPresentPositionCheckpoint(profile: GeometryProfile, altitude: Feet) {
        profile.checkpoints.push({
            reason: VerticalCheckpointReason.PresentPosition,
            distanceFromStart: profile.distanceToPresentPosition,
            secondsFromPresent: 0,
            altitude,
            remainingFuelOnBoard: this.computationParametersObserver.get().fuelOnBoard,
            speed: SimVar.GetSimVarValue('AIRSPEED INDICATED', 'knots'),
        });
    }

    private addTakeoffStepCheckpoint(profile: GeometryProfile, groundAltitude: Feet, thrustReductionAltitude: Feet) {
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

    private addAccelerationAltitudeStep(profile: GeometryProfile, startingAltitude: Feet, targetAltitude: Feet, speed: Knots) {
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

    private addClimbSteps(profile: GeometryProfile, finalAltitude: Feet, finalAltitudeReason: VerticalCheckpointReason = VerticalCheckpointReason.AtmosphericConditions) {
        for (const constraint of profile.maxAltitudeConstraints) {
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

    private buildIteratedClimbSegment(profile: GeometryProfile, startingAltitude: Feet, targetAltitude: Feet): void {
        const { managedClimbSpeed, speedLimit } = this.computationParametersObserver.get();

        for (let altitude = startingAltitude; altitude < targetAltitude; altitude = Math.min(altitude + 1500, targetAltitude)) {
            const lastCheckpoint = profile.lastCheckpoint;

            const climbSpeed = Math.min(
                altitude >= speedLimit.underAltitude ? managedClimbSpeed : speedLimit.speed,
                this.findMaxSpeedAtDistanceAlongTrack(profile, lastCheckpoint.distanceFromStart),
            );

            const targetAltitudeForSegment = Math.min(altitude + 1500, targetAltitude);
            const remainingFuelOnBoard = lastCheckpoint.remainingFuelOnBoard;

            const { distanceTraveled, fuelBurned, timeElapsed } = this.computeClimbSegmentPrediction(altitude, targetAltitudeForSegment, climbSpeed, remainingFuelOnBoard);

            profile.checkpoints.push({
                reason: VerticalCheckpointReason.AtmosphericConditions,
                distanceFromStart: lastCheckpoint.distanceFromStart + distanceTraveled,
                secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
                altitude: targetAltitudeForSegment,
                remainingFuelOnBoard: remainingFuelOnBoard - fuelBurned,
                speed: Math.min(
                    altitude >= speedLimit.underAltitude ? managedClimbSpeed : speedLimit.speed,
                    this.findMaxSpeedAtDistanceAlongTrack(profile, lastCheckpoint.distanceFromStart + distanceTraveled),
                ),
            });
        }
    }

    private addLevelSegmentSteps(profile: GeometryProfile, toDistanceFromStart: NauticalMiles): void {
        const { managedClimbSpeed, speedLimit } = this.computationParametersObserver.get();

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

            const speed = Math.min(
                altitude >= speedLimit.underAltitude ? managedClimbSpeed : speedLimit.speed,
                speedConstraint.maxSpeed,
            );

            const { fuelBurned, timeElapsed } = this.computeLevelFlightSegmentPrediction(
                profile.geometry,
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
        const speed = Math.min(
            altitude >= speedLimit.underAltitude ? managedClimbSpeed : speedLimit.speed,
            this.findMaxSpeedAtDistanceAlongTrack(profile, toDistanceFromStart),
        );

        const lastCheckpoint = profile.lastCheckpoint;

        const { fuelBurned, timeElapsed } = this.computeLevelFlightSegmentPrediction(
            profile.geometry,
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

    private computeLevelFlightSegmentPrediction(geometry: Geometry, stepSize: Feet, altitude: Feet, speed: Knots, fuelWeight: number): StepResults {
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

    private addTakeoffRollCheckpoint(profile: GeometryProfile, remainingFuelOnBoard: number) {
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

    private findMaxSpeedAtDistanceAlongTrack(profile: GeometryProfile, distanceAlongTrack: NauticalMiles): Knots {
        let maxSpeed = Infinity;

        for (const constraint of profile.maxSpeedConstraints) {
            if (distanceAlongTrack <= constraint.distanceFromStart && constraint.maxSpeed < maxSpeed) {
                maxSpeed = constraint.maxSpeed;
            }
        }

        return maxSpeed;
    }

    private addSpeedConstraintsAsCheckpoints(profile: GeometryProfile): void {
        for (const { distanceFromStart, maxSpeed } of profile.maxSpeedConstraints) {
            profile.addSpeedCheckpoint(distanceFromStart, maxSpeed, VerticalCheckpointReason.SpeedConstraint);
        }
    }
}
