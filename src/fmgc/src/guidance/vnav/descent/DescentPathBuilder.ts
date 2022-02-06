import { VerticalCheckpoint, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { GeometricPathBuilder } from '@fmgc/guidance/vnav/descent/GeometricPathBuilder';
import { DescentStrategy, IdleDescentStrategy } from '@fmgc/guidance/vnav/descent/DescentStrategy';
import { StepResults } from '@fmgc/guidance/vnav/Predictions';

export class DescentPathBuilder {
    private geometricPathBuilder: GeometricPathBuilder;

    private idleDescentStrategy: DescentStrategy;

    constructor(
        private computationParametersObserver: VerticalProfileComputationParametersObserver,
        private atmosphericConditions: AtmosphericConditions,
    ) {
        this.geometricPathBuilder = new GeometricPathBuilder(computationParametersObserver, atmosphericConditions);

        this.idleDescentStrategy = new IdleDescentStrategy(computationParametersObserver, atmosphericConditions);
    }

    update() {
        this.atmosphericConditions.update();
    }

    computeManagedDescentPath(profile: BaseGeometryProfile, speedProfile: SpeedProfile, cruiseAltitude: Feet): VerticalCheckpoint {
        const decelCheckpoint = profile.checkpoints.find((checkpoint) => checkpoint.reason === VerticalCheckpointReason.Decel);

        if (!decelCheckpoint) {
            return undefined;
        }

        this.geometricPathBuilder.buildGeometricPath(profile, speedProfile, cruiseAltitude);

        const geometricPathStart = profile.findVerticalCheckpoint(VerticalCheckpointReason.GeometricPathStart);

        if (geometricPathStart) {
            // The last checkpoint here is the start of the Geometric path
            this.buildIdlePath(profile, speedProfile, cruiseAltitude);
            const tod = profile.lastCheckpoint;

            // TODO: This should not be here ideally
            profile.sortCheckpoints();

            return tod;
        }

        console.error('[FMS/VNAV](computeDescentPath) Cannot compute idle path without geometric path');

        return undefined;
    }

    private buildIdlePath(profile: BaseGeometryProfile, speedProfile: SpeedProfile, topOfDescentAltitude: Feet): void {
        // Assume the last checkpoint is the start of the geometric path
        profile.addCheckpointFromLast((lastCheckpoint) => ({ ...lastCheckpoint, reason: VerticalCheckpointReason.IdlePathEnd }));

        const { managedDescentSpeedMach } = this.computationParametersObserver.get();

        for (let altitude = profile.lastCheckpoint.altitude; altitude < topOfDescentAltitude; altitude = Math.min(altitude + 1500, topOfDescentAltitude)) {
            const { distanceFromStart, remainingFuelOnBoard } = profile.lastCheckpoint;

            const startingAltitudeForSegment = Math.min(altitude + 1500, topOfDescentAltitude);
            const speed = speedProfile.getTarget(distanceFromStart, startingAltitudeForSegment);

            const step = this.idleDescentStrategy.predictToAltitude(startingAltitudeForSegment, altitude, speed, managedDescentSpeedMach, remainingFuelOnBoard);
            this.addCheckpointFromStep(profile, step, VerticalCheckpointReason.IdlePathAtmosphericConditions)
        }

        if (profile.lastCheckpoint.reason === VerticalCheckpointReason.IdlePathAtmosphericConditions) {
            profile.lastCheckpoint.reason = VerticalCheckpointReason.TopOfDescent;
        } else {
            profile.addCheckpointFromLast((lastCheckpoint) => ({ ...lastCheckpoint, reason: VerticalCheckpointReason.TopOfDescent }));
        }
    }

    private addCheckpointFromStep(profile: BaseGeometryProfile, step: StepResults, reason: VerticalCheckpointReason) {
        profile.addCheckpointFromLast(({ distanceFromStart, secondsFromPresent, remainingFuelOnBoard }) => ({
            reason,
            distanceFromStart: distanceFromStart + step.distanceTraveled,
            altitude: step.finalAltitude,
            secondsFromPresent: secondsFromPresent + (step.timeElapsed * 60),
            speed: step.speed,
            remainingFuelOnBoard: remainingFuelOnBoard - step.fuelBurned,
        }));
    }
}
