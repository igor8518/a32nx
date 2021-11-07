import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Predictions, StepResults } from '../Predictions';
import { GeometryProfile, VerticalCheckpointReason } from '../GeometryProfile';
import { AtmosphericConditions } from '../AtmosphericConditions';

export interface CruisePathBuilderResults {
    remainingFuelOnBoardAtTopOfDescent: number,
    secondsFromStartAtTopOfDescent: Seconds,
    distanceTraveled: NauticalMiles,
    timeElapsed: Seconds,
    fuelBurned: number,
}

export class CruisePathBuilder {
    private static TONS_TO_POUNDS = 2204.62;

    private atmosphericConditions: AtmosphericConditions = new AtmosphericConditions();

    constructor(private computationParametersObserver: VerticalProfileComputationParametersObserver) { }

    update() {
        this.atmosphericConditions.update();
    }

    computeCruisePath(profile: GeometryProfile): CruisePathBuilderResults {
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
            zeroFuelWeight * CruisePathBuilder.TONS_TO_POUNDS,
            remainingFuelOnBoard,
            0,
            this.atmosphericConditions.isaDeviation,
        );
    }
}
