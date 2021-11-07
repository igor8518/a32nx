import { AltitudeConstraintType } from '@fmgc/guidance/lnav/legs';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { FlapConf } from '@fmgc/guidance/vnav/common';
import { Predictions } from '@fmgc/guidance/vnav/Predictions';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';

export class GeometricPathBuilder {
    constructor(private observer: VerticalProfileComputationParametersObserver, private atmosphericConditions: AtmosphericConditions) { }

    buildGeometricPath(profile: BaseGeometryProfile, speedProfile: SpeedProfile) {
        const { managedDescentSpeedMach, zeroFuelWeight, tropoPause } = this.observer.get();

        const decelPoint = profile.findVerticalCheckpoint(VerticalCheckpointReason.Decel);

        profile.checkpoints.push({ ...decelPoint, reason: VerticalCheckpointReason.GeometricPathEnd });

        let { altitude, distanceFromStart, remainingFuelOnBoard, secondsFromPresent } = profile.lastCheckpoint;

        for (const constraintAlongTrack of profile.descentAltitudeConstraints.slice().reverse()) {
            if (constraintAlongTrack.distanceFromStart > distanceFromStart) {
                continue;
            }

            switch (constraintAlongTrack.constraint.type) {
            case AltitudeConstraintType.at:
            case AltitudeConstraintType.atOrAbove:
            case AltitudeConstraintType.atOrBelow:
            case AltitudeConstraintType.range:
                const stepSpeed = speedProfile.get(constraintAlongTrack.distanceFromStart, altitude);

                const stepAchievable = Predictions.geometricStepAchievable(
                    constraintAlongTrack.constraint.altitude1,
                    altitude,
                    distanceFromStart - constraintAlongTrack.distanceFromStart,
                    stepSpeed,
                    managedDescentSpeedMach,
                    this.predictN1((altitude + constraintAlongTrack.constraint.altitude1) / 2),
                    zeroFuelWeight * Constants.TONS_TO_POUNDS,
                    remainingFuelOnBoard, // TODO: Predict fuel at start of descent, not at the end
                    0,
                    this.atmosphericConditions.isaDeviation,
                    tropoPause,
                );

                if (!stepAchievable) {
                    altitude = constraintAlongTrack.constraint.altitude1;
                    distanceFromStart = constraintAlongTrack.distanceFromStart;

                    profile.checkpoints.push({
                        reason: VerticalCheckpointReason.GeometricPathTooSteep,
                        altitude,
                        distanceFromStart,
                        remainingFuelOnBoard,
                        secondsFromPresent,
                        speed: speedProfile.get(constraintAlongTrack.distanceFromStart, altitude),
                    });

                    continue;
                }

                const { fuelBurned, timeElapsed } = Predictions.geometricStep(
                    constraintAlongTrack.constraint.altitude1,
                    altitude,
                    distanceFromStart - constraintAlongTrack.distanceFromStart,
                    stepSpeed,
                    managedDescentSpeedMach,
                    zeroFuelWeight * Constants.TONS_TO_POUNDS,
                    remainingFuelOnBoard, // TODO: Predict fuel at start of descent, not at the end
                    this.atmosphericConditions.isaDeviation,
                    tropoPause,
                    false,
                    FlapConf.CLEAN,
                );

                altitude = constraintAlongTrack.constraint.altitude1;
                distanceFromStart = constraintAlongTrack.distanceFromStart;
                remainingFuelOnBoard += fuelBurned;
                secondsFromPresent -= timeElapsed;

                profile.checkpoints.push({
                    reason: VerticalCheckpointReason.GeometricPathConstraint,
                    altitude,
                    distanceFromStart,
                    remainingFuelOnBoard,
                    secondsFromPresent,
                    speed: stepSpeed,
                });
                break;

            default:
                throw new Error('[FMS/VNAV] Encountered invalid AltitudeConstraintType');
            }
        }

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.GeometricPathStart,
            altitude,
            distanceFromStart,
            remainingFuelOnBoard,
            secondsFromPresent,
            speed: speedProfile.get(distanceFromStart, altitude),
        });
    }

    private predictN1(altitude: Feet): number {
        return 26 + ((36000 / altitude) * (30 - 26));
    }
}
