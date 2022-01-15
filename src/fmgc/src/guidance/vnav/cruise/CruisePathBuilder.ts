import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';
import { StepCoordinator } from '@fmgc/guidance/vnav/StepCoordinator';
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
    constructor(private computationParametersObserver: VerticalProfileComputationParametersObserver,
        private atmosphericConditions: AtmosphericConditions,
        private stepCoordinator: StepCoordinator) { }

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

    getFinalCruiseAltitude(): Feet {
        const { cruiseAltitude } = this.computationParametersObserver.get();

        if (this.stepCoordinator.steps.length === 0) {
            return cruiseAltitude;
        }

        return this.stepCoordinator.steps[this.stepCoordinator.steps.length - 1].toAltitude;
    }
}
