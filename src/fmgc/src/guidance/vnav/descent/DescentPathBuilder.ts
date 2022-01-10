import { TheoreticalDescentPathCharacteristics } from '@fmgc/guidance/vnav/descent/TheoreticalDescentPath';
import { NavGeometryProfile, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { Predictions, StepResults } from '@fmgc/guidance/vnav/Predictions';
import { FlapConf } from '@fmgc/guidance/vnav/common';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { ClimbPathBuilder } from '@fmgc/guidance/vnav/climb/ClimbPathBuilder';

export class DescentPathBuilder {
    private atmosphericConditions: AtmosphericConditions = new AtmosphericConditions();

    constructor(
        private computationParametersObserver: VerticalProfileComputationParametersObserver,
    ) {
    }

    update() {
        this.atmosphericConditions.update();
    }

    computeDescentPath(profile: NavGeometryProfile, speedProfile: SpeedProfile): TheoreticalDescentPathCharacteristics {
        const decelCheckpoint = profile.checkpoints.find((checkpoint) => checkpoint.reason === VerticalCheckpointReason.Decel);

        if (!decelCheckpoint) {
            return { tod: undefined, fuelBurnedDuringDescent: undefined, remainingFuelOnBoardAtTopOfDescent: undefined };
        }

        const cruiseAlt = SimVar.GetSimVarValue('L:AIRLINER_CRUISE_ALTITUDE', 'number');
        const verticalDistance = cruiseAlt - decelCheckpoint.altitude;
        const fpa = 3;

        if (DEBUG) {
            console.log(cruiseAlt);
            console.log(verticalDistance);
        }

        const todEstimate = decelCheckpoint.distanceFromStart - (verticalDistance / Math.tan((fpa * Math.PI) / 180)) * 0.000164579;

        const tocCheckpoint = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfClimb);

        if (tocCheckpoint) {
            // Estimate ToD checkpoint
            const todEstimateDistanceFromStart = Math.min(tocCheckpoint.distanceFromStart, todEstimate);

            profile.checkpoints.push({
                reason: VerticalCheckpointReason.TopOfDescent,
                distanceFromStart: todEstimateDistanceFromStart,
                secondsFromPresent: profile.interpolateTimeAtDistance(todEstimateDistanceFromStart),
                altitude: tocCheckpoint.altitude,
                remainingFuelOnBoard: profile.interpolateFuelAtDistance(todEstimateDistanceFromStart),
                speed: tocCheckpoint.speed,
            });

            const todEstimateCheckpoint = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfDescent);

            this.buildIdlePath(profile, speedProfile, todEstimateCheckpoint.altitude, decelCheckpoint.altitude);

            profile.sortCheckpoints();

            const lastIdlePathCheckpoint = profile.findLastVerticalCheckpoint(VerticalCheckpointReason.IdlePathAtmosphericConditions);

            // Check that the idle path ends before our reference point (at the moment, always DECEL)
            if (lastIdlePathCheckpoint.distanceFromStart > decelCheckpoint.distanceFromStart) {
                // If so, do not do an idle path for now TODO insert a vertical discontinuity ?
                profile.purgeVerticalCheckpoints(VerticalCheckpointReason.IdlePathAtmosphericConditions);
            }

            return {
                tod: todEstimate,
                fuelBurnedDuringDescent: tocCheckpoint.remainingFuelOnBoard - lastIdlePathCheckpoint.remainingFuelOnBoard,
                remainingFuelOnBoardAtEndOfIdlePath: lastIdlePathCheckpoint.remainingFuelOnBoard,
                remainingFuelOnBoardAtTopOfDescent: todEstimateCheckpoint.remainingFuelOnBoard,
            };
        }

        console.error('[FMS/VNAV](computeDescentPath) Cannot compute descent path without ToC');

        return undefined;
    }

    private buildIdlePath(profile: BaseGeometryProfile, speedProfile: SpeedProfile, startingAltitude: Feet, targetAltitude: Feet): void {
        if (targetAltitude > startingAltitude) {
            throw new Error('[FMS/VNAV/DescentPathBuilder] targetAltitude was greater than startingAltitude.');
        }

        for (let altitude = startingAltitude; altitude > targetAltitude; altitude = Math.max(altitude - 1500, targetAltitude)) {
            const lastCheckpoint = profile.lastCheckpoint;

            const speed = speedProfile.get(lastCheckpoint.distanceFromStart, altitude);

            const targetAltitudeForSegment = Math.max(altitude - 1500, targetAltitude);
            const remainingFuelOnBoard = lastCheckpoint.remainingFuelOnBoard;

            const { distanceTraveled, fuelBurned, timeElapsed } = this.computeIdlePathSegmentPrediction(altitude, targetAltitudeForSegment, speed, remainingFuelOnBoard);

            profile.checkpoints.push({
                reason: VerticalCheckpointReason.IdlePathAtmosphericConditions,
                distanceFromStart: lastCheckpoint.distanceFromStart + distanceTraveled,
                secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
                altitude: targetAltitudeForSegment,
                remainingFuelOnBoard: remainingFuelOnBoard - fuelBurned,
                speed: speedProfile.get(lastCheckpoint.distanceFromStart + distanceTraveled, targetAltitudeForSegment),
            });
        }
    }

    private computeIdlePathSegmentPrediction(startingAltitude: Feet, targetAltitude: Feet, climbSpeed: Knots, remainingFuelOnBoard: number): StepResults {
        const { zeroFuelWeight, perfFactor, tropoPause } = this.computationParametersObserver.get();

        const midwayAltitudeClimb = (startingAltitude + targetAltitude) / 2;
        const machClimb = this.atmosphericConditions.computeMachFromCas(midwayAltitudeClimb, climbSpeed);

        const predictedN1 = 26 + ((targetAltitude / midwayAltitudeClimb) * (30 - 26));

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
}
