import { CruisePathBuilder } from '@fmgc/guidance/vnav/cruise/CruisePathBuilder';
import { DescentPathBuilder } from '@fmgc/guidance/vnav/descent/DescentPathBuilder';
import { DecelPathBuilder } from '@fmgc/guidance/vnav/descent/DecelPathBuilder';
import { NavGeometryProfile, VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { SpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { ClimbStrategy, DescentStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';

export class CruiseToDescentCoordinator {
    constructor(private cruisePathBuilder: CruisePathBuilder, private descentPathBuilder: DescentPathBuilder, private decelPathBuilder: DecelPathBuilder) {

    }

    buildCruiseAndDescentPath(profile: NavGeometryProfile, speedProfile: SpeedProfile, stepClimbStrategy: ClimbStrategy, stepDescentStrategy: DescentStrategy) {
        // - Start with initial guess for fuel on board at destination
        // - Compute descent profile to get distance to T/D and burnt fuel during descent
        // - Compute cruise profile to T/D -> guess new guess for fuel at start T/D, use fuel burn to get new estimate for fuel at destination
        // - Repeat
        let estimatedFuelAtDestination = 2_300;
        let estimatedTimeAtDestination = 0;

        const topOfClimbIndex = profile.checkpoints.findIndex((checkpoint) => checkpoint.reason === VerticalCheckpointReason.TopOfClimb);

        if (topOfClimbIndex < 0) {
            return;
        }

        let iterationCount = 0;
        let todFuelError = Infinity;
        let todTimeError = Infinity;

        while (iterationCount++ < 4 && (Math.abs(todFuelError) > 100 || Math.abs(todTimeError) > 1)) {
            // Reset checkpoints
            profile.checkpoints.splice(topOfClimbIndex + 1, profile.checkpoints.length - topOfClimbIndex - 1);
            this.decelPathBuilder.computeDecelPath(profile, estimatedFuelAtDestination, estimatedTimeAtDestination);

            // Geometric and idle
            const todCheckpoint = this.descentPathBuilder.computeDescentPath(profile, speedProfile, this.cruisePathBuilder.getFinalCruiseAltitude());
            const cruisePath = this.cruisePathBuilder.computeCruisePath(profile, stepClimbStrategy, stepDescentStrategy);

            if (!cruisePath || !todCheckpoint) {
                throw new Error('[FMS/VNAV] Could not coordinate cruise and descent path');
            }

            todFuelError = cruisePath.remainingFuelOnBoardAtTopOfDescent - todCheckpoint.remainingFuelOnBoard;
            todTimeError = cruisePath.secondsFromPresentAtTopOfDescent - todCheckpoint.secondsFromPresent;

            estimatedFuelAtDestination += todFuelError;
            estimatedTimeAtDestination += todTimeError;
        }
    }

    buildDescentPathOnly(profile: NavGeometryProfile, speedProfile: SpeedProfile) {
        let estimatedFuelAtDestination = 2_300;
        let estimatedTimeAtDestination = 0;

        const presentPositionCheckpoint = profile.checkpoints[0];

        if (presentPositionCheckpoint.reason !== VerticalCheckpointReason.PresentPosition) {
            console.error(`[FMS/VNAV] Expected PresentPosition checkpoint, got ${presentPositionCheckpoint.reason}`);
            return;
        }

        let iterationCount = 0;
        let todFuelError = Infinity;
        let todTimeError = Infinity;

        while (iterationCount++ < 4 && (Math.abs(todFuelError) > 100 || Math.abs(todTimeError) > 1)) {
            // Reset checkpoints
            profile.checkpoints.splice(1, profile.checkpoints.length - 1);
            this.decelPathBuilder.computeDecelPath(profile, estimatedFuelAtDestination, estimatedTimeAtDestination);

            // Geometric and idle
            const startOfDescent = this.descentPathBuilder.computeDescentPath(profile, speedProfile, presentPositionCheckpoint.altitude);

            if (!startOfDescent) {
                throw new Error('[FMS/VNAV] Could not compute descent path');
            }

            todFuelError = presentPositionCheckpoint.remainingFuelOnBoard - startOfDescent.remainingFuelOnBoard;
            todTimeError = presentPositionCheckpoint.secondsFromPresent - startOfDescent.secondsFromPresent;

            estimatedFuelAtDestination += todFuelError;
            estimatedTimeAtDestination += todTimeError;
        }
    }
}
