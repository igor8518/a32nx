import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';
import { Predictions, StepResults } from '../Predictions';
import { NavGeometryProfile, VerticalCheckpointReason } from '../profile/NavGeometryProfile';
import { AtmosphericConditions } from '../AtmosphericConditions';

export interface CruisePathBuilderResults {
    remainingFuelOnBoardAtTopOfDescent: number,
    secondsFromStartAtTopOfDescent: Seconds,
    distanceTraveled: NauticalMiles,
    timeElapsed: Seconds,
    fuelBurned: number,
}

export class CruisePathBuilder {
    private atmosphericConditions: AtmosphericConditions = new AtmosphericConditions();

    constructor(private computationParametersObserver: VerticalProfileComputationParametersObserver) { }

    update() {
        this.atmosphericConditions.update();
    }

    computeCruisePath(profile: NavGeometryProfile): CruisePathBuilderResults {
        const topOfClimb = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfClimb);
        const topOfDescent = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfDescent);

        if (!topOfClimb?.distanceFromStart || !topOfDescent?.distanceFromStart) {
            return null;
        }

        if (topOfClimb.distanceFromStart > topOfDescent.distanceFromStart) {
            console.warn('[FMS/VNAV] Cruise segment too short');
            return null;
        }

        const { fuelBurned, timeElapsed, distanceTraveled } = this.computeCruiseSegment(topOfDescent.distanceFromStart - topOfClimb.distanceFromStart, topOfClimb.remainingFuelOnBoard);

        return {
            remainingFuelOnBoardAtTopOfDescent: topOfClimb.remainingFuelOnBoard - fuelBurned,
            secondsFromStartAtTopOfDescent: topOfClimb.secondsFromPresent + timeElapsed * 60,
            distanceTraveled,
            timeElapsed,
            fuelBurned,
        };
    }

    private computeCruiseSegment(distance: NauticalMiles, remainingFuelOnBoard: number): StepResults {
        const { zeroFuelWeight, cruiseAltitude, managedCruiseSpeed, managedCruiseSpeedMach } = this.computationParametersObserver.get();

        return Predictions.levelFlightStep(
            cruiseAltitude,
            distance,
            managedCruiseSpeed,
            managedCruiseSpeedMach,
            zeroFuelWeight * Constants.TONS_TO_POUNDS,
            remainingFuelOnBoard,
            0,
            this.atmosphericConditions.isaDeviation,
        );
    }
}
