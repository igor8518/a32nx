import { CruisePathBuilder } from '@fmgc/guidance/vnav/cruise/CruisePathBuilder';
import { DescentPathBuilder } from '@fmgc/guidance/vnav/descent/DescentPathBuilder';
import { DecelPathBuilder } from '@fmgc/guidance/vnav/descent/DecelPathBuilder';
import { GeometryProfile, VerticalCheckpointReason } from '@fmgc/guidance/vnav/GeometryProfile';

export class CruiseToDescentCoordinator {
    constructor(private cruisePathBuilder: CruisePathBuilder, private descentPathBuilder: DescentPathBuilder, private decelPathBuilder: DecelPathBuilder) {

    }

    coordinate(profile: GeometryProfile) {
        // - Start with initial guess for fuel on board at destination
        // - Compute descent profile to get distance to T/D and burnt fuel during descent
        // - Compute cruise profile to T/D -> guess new guess for fuel at start T/D, use fuel burn to get new estimate for fuel at destination
        // - Repeat
        let estimatedFuelAtDestination = 2_300;

        const topOfClimbIndex = profile.checkpoints.findIndex((checkpoint) => checkpoint.reason === VerticalCheckpointReason.TopOfClimb);
        if (topOfClimbIndex < 0) {
            return;
        }

        if (!this.decelPathBuilder.canCompute(profile.geometry)) {
            return;
        }

        let iterationCount = 0;
        let error = Infinity;

        while (iterationCount++ < 4 && Math.abs(error) > 100) {
            // Reset checkpoints
            profile.checkpoints.splice(topOfClimbIndex + 1, profile.checkpoints.length - topOfClimbIndex - 1);

            this.decelPathBuilder.computeDecelPath(profile, estimatedFuelAtDestination);
            const { fuelBurnedDuringDescent, remainingFuelOnBoardAtTopOfDescent: remainingFuelOnBoardAtTopOfDescentComputedBackwards } = this.descentPathBuilder.computeDescentPath(profile);
            if (!fuelBurnedDuringDescent) {
                return;
            }

            const cruisePath = this.cruisePathBuilder.computeCruisePath(profile);

            if (!cruisePath) {
                return;
            }

            const {
                remainingFuelOnBoardAtTopOfDescent: remainingFuelOnBoardAtTopOfDescentComputedForwards,
                distanceTraveled,
                timeElapsed,
            } = cruisePath;

            if (DEBUG) {
                console.log(`[FMS/VNAV] Cruise segment was ${distanceTraveled} nm long and took ${timeElapsed} min`);
            }

            estimatedFuelAtDestination = remainingFuelOnBoardAtTopOfDescentComputedForwards - fuelBurnedDuringDescent;
            error = remainingFuelOnBoardAtTopOfDescentComputedForwards - remainingFuelOnBoardAtTopOfDescentComputedBackwards;
        }
    }
}
