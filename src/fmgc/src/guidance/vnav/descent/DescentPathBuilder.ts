import { VerticalCheckpoint, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { Predictions, StepResults } from '@fmgc/guidance/vnav/Predictions';
import { FlapConf } from '@fmgc/guidance/vnav/common';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';
import { GeometricPathBuilder } from '@fmgc/guidance/vnav/descent/GeometricPathBuilder';

export class DescentPathBuilder {
    private geometricPathBuilder: GeometricPathBuilder;

    constructor(
        private computationParametersObserver: VerticalProfileComputationParametersObserver,
        private atmosphericConditions: AtmosphericConditions,
    ) {
        this.geometricPathBuilder = new GeometricPathBuilder(computationParametersObserver, atmosphericConditions);
    }

    update() {
        this.atmosphericConditions.update();
    }

    computeDescentPath(profile: BaseGeometryProfile, speedProfile: SpeedProfile, cruiseAltitude: Feet): VerticalCheckpoint {
        const decelCheckpoint = profile.checkpoints.find((checkpoint) => checkpoint.reason === VerticalCheckpointReason.Decel);

        if (!decelCheckpoint) {
            return undefined;
        }

        this.geometricPathBuilder.buildGeometricPath(profile, speedProfile, cruiseAltitude);

        const geometricPathStart = profile.findVerticalCheckpoint(VerticalCheckpointReason.GeometricPathStart);
        const tocCheckpoint = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfClimb);

        if (tocCheckpoint && geometricPathStart) {
            // The last checkpoint here is the start of the Geometric path
            this.buildIdlePath(profile, speedProfile, cruiseAltitude);
            const tod = profile.lastCheckpoint;

            // TODO: This should not be here ideally
            profile.sortCheckpoints();

            return tod;
        }

        console.error('[FMS/VNAV](computeDescentPath) Cannot compute descent path without ToC');

        return undefined;
    }

    private buildIdlePath(profile: BaseGeometryProfile, speedProfile: SpeedProfile, topOfDescentAltitude: Feet): void {
        // Assume the last checkpoint is the start of the geometric path
        profile.addCheckpointFromLast((lastCheckpoint) => ({ ...lastCheckpoint, reason: VerticalCheckpointReason.IdlePathEnd }));

        for (let altitude = profile.lastCheckpoint.altitude; altitude < topOfDescentAltitude; altitude = Math.min(altitude + 1500, topOfDescentAltitude)) {
            const lastCheckpoint = profile.lastCheckpoint;

            const startingAltitudeForSegment = Math.min(altitude + 1500, topOfDescentAltitude);
            const speed = speedProfile.getTarget(lastCheckpoint.distanceFromStart, startingAltitudeForSegment);

            // TODO: Use fuel at start of segment
            const remainingFuelOnBoard = lastCheckpoint.remainingFuelOnBoard;

            const { distanceTraveled, fuelBurned, timeElapsed } = this.computeIdlePathSegmentPrediction(startingAltitudeForSegment, altitude, speed, remainingFuelOnBoard);

            profile.checkpoints.push({
                reason: VerticalCheckpointReason.IdlePathAtmosphericConditions,
                distanceFromStart: lastCheckpoint.distanceFromStart - distanceTraveled,
                secondsFromPresent: lastCheckpoint.secondsFromPresent - (timeElapsed * 60),
                altitude: startingAltitudeForSegment,
                remainingFuelOnBoard: remainingFuelOnBoard + fuelBurned,
                speed,
            });
        }

        profile.lastCheckpoint.reason = VerticalCheckpointReason.TopOfDescent;
    }

    private computeIdlePathSegmentPrediction(startingAltitude: Feet, targetAltitude: Feet, climbSpeed: Knots, remainingFuelOnBoard: number): StepResults {
        const { zeroFuelWeight, perfFactor, tropoPause, managedDescentSpeedMach } = this.computationParametersObserver.get();

        const midwayAltitudeClimb = (startingAltitude + targetAltitude) / 2;

        const predictedN1 = 26 + ((targetAltitude / midwayAltitudeClimb) * (30 - 26));

        return Predictions.altitudeStep(
            startingAltitude,
            targetAltitude - startingAltitude,
            climbSpeed,
            managedDescentSpeedMach,
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
}
