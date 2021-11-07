import { TheoreticalDescentPathCharacteristics } from '@fmgc/guidance/vnav/descent/TheoreticalDescentPath';
import { GeometryProfile, VerticalCheckpointReason } from '@fmgc/guidance/vnav/GeometryProfile';

export class DescentPathBuilder {
    static computeDescentPath(profile: GeometryProfile): TheoreticalDescentPathCharacteristics {
        const decelCheckpoint = profile.checkpoints.find((checkpoint) => checkpoint.reason === VerticalCheckpointReason.Decel);

        if (!decelCheckpoint) {
            return { tod: undefined };
        }

        const cruiseAlt = SimVar.GetSimVarValue('L:AIRLINER_CRUISE_ALTITUDE', 'number');
        const verticalDistance = cruiseAlt - decelCheckpoint.altitude;
        const fpa = 3;

        if (DEBUG) {
            console.log(cruiseAlt);
            console.log(verticalDistance);
        }

        const tod = decelCheckpoint.distanceFromStart - (verticalDistance / Math.tan((fpa * Math.PI) / 180)) * 0.000164579;

        if (DEBUG) {
            console.log(`[FMS/VNAV] T/D: ${tod.toFixed(1)}nm`);
        }

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.TopOfDescent,
            distanceFromStart: tod,
            speed: 290,
            // remainingFuelOnBoard: 250,
            altitude: cruiseAlt,
        });

        return { tod };

        //     const decelPointDistance = DecelPathBuilder.computeDecelPath(geometry);
        //
        //     const lastLegIndex = geometry.legs.size - 1;
        //
        //     // Find descent legs before decel point
        //     let accumulatedDistance = 0;
        //     let currentLegIdx;
        //     let currentLeg;
        //     for (currentLegIdx = lastLegIndex; accumulatedDistance < decelPointDistance; currentLegIdx--) {
        //         currentLeg = geometry.legs.get(currentLegIdx);
        //
        //         accumulatedDistance += currentLeg.distance;
        //     }
        //     currentLegIdx--;
        //
        //     const geometricPath = GeomtricPathBuilder.buildGeometricPath(geometry, currentLegIdx);
        //
        //     console.log(geometricPath);
        //
        //     return { geometricPath };
        // }
    }
}
