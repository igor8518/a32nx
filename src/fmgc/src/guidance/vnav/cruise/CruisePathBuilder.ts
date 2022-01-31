import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';
import { StepCoordinator } from '@fmgc/guidance/vnav/StepCoordinator';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { ClimbStrategy, DescentStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { Predictions, StepResults } from '../Predictions';
import { VerticalCheckpointReason } from '../profile/NavGeometryProfile';
import { AtmosphericConditions } from '../AtmosphericConditions';

export interface CruisePathBuilderResults {
    remainingFuelOnBoardAtTopOfDescent: number,
    secondsFromPresentAtTopOfDescent: number
}

export class CruisePathBuilder {
    constructor(private computationParametersObserver: VerticalProfileComputationParametersObserver,
        private atmosphericConditions: AtmosphericConditions,
        private stepCoordinator: StepCoordinator) { }

    update() {
        this.atmosphericConditions.update();
    }

    computeCruisePath(profile: BaseGeometryProfile, stepClimbStrategy: ClimbStrategy, stepDescentStrategy: DescentStrategy): CruisePathBuilderResults {
        const topOfClimb = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfClimb);
        const presentPosition = profile.findVerticalCheckpoint(VerticalCheckpointReason.PresentPosition);

        const startOfCruise = topOfClimb ?? presentPosition;

        const topOfDescent = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfDescent);

        if (!startOfCruise?.distanceFromStart || !topOfDescent?.distanceFromStart) {
            return null;
        }

        if (startOfCruise.distanceFromStart > topOfDescent.distanceFromStart) {
            console.warn('[FMS/VNAV] Cruise segment too short');
            return null;
        }

        const { managedCruiseSpeed, managedCruiseSpeedMach } = this.computationParametersObserver.get();

        // Steps
        let { distanceFromStart, altitude, remainingFuelOnBoard, secondsFromPresent } = startOfCruise;

        const steps = this.stepCoordinator.steps;
        for (const step of steps) {
            // If the step is too close to T/D
            if (step.isIgnored) {
                continue;
            }

            // TODO: What happens if the step is at cruise altitude?
            const isClimbVsDescent = step.toAltitude > altitude;

            const stepDistanceFromStart = step.distanceFromStart;

            if (stepDistanceFromStart < startOfCruise.distanceFromStart || stepDistanceFromStart > topOfDescent.distanceFromStart) {
                if (VnavConfig.DEBUG_PROFILE) {
                    console.warn(
                        `[FMS/VNAV] Cruise step is not within cruise segment \
                        (${stepDistanceFromStart.toFixed(2)} NM, T/C: ${startOfCruise.distanceFromStart.toFixed(2)} NM, T/D: ${topOfDescent.distanceFromStart.toFixed(2)} NM)`,
                    );
                }

                continue;
            }

            const { fuelBurned, timeElapsed, distanceTraveled } = this.computeCruiseSegment(stepDistanceFromStart - distanceFromStart, remainingFuelOnBoard);

            distanceFromStart += distanceTraveled;
            remainingFuelOnBoard -= fuelBurned;
            secondsFromPresent += timeElapsed * 60;

            profile.addCheckpointAtDistanceFromStart(stepDistanceFromStart, {
                reason: isClimbVsDescent ? VerticalCheckpointReason.StepClimb : VerticalCheckpointReason.StepDescent,
                altitude,
                secondsFromPresent,
                remainingFuelOnBoard,
                speed: managedCruiseSpeed,
            });

            const { fuelBurned: fuelBurnedStep, timeElapsed: timeElapsedStep, distanceTraveled: distanceTraveledStep } = isClimbVsDescent
                ? stepClimbStrategy.predictToAltitude(altitude, step.toAltitude, managedCruiseSpeed, managedCruiseSpeedMach, remainingFuelOnBoard)
                : stepDescentStrategy.predictToAltitude(altitude, step.toAltitude, managedCruiseSpeed, managedCruiseSpeed, remainingFuelOnBoard);

            distanceFromStart += distanceTraveledStep;
            remainingFuelOnBoard -= fuelBurnedStep;
            secondsFromPresent += timeElapsedStep * 60;
            altitude = step.toAltitude;

            profile.addCheckpointAtDistanceFromStart(distanceFromStart + distanceTraveledStep, {
                reason: isClimbVsDescent ? VerticalCheckpointReason.TopOfStepClimb : VerticalCheckpointReason.BottomOfStepDescent,
                secondsFromPresent,
                remainingFuelOnBoard,
                altitude,
                speed: managedCruiseSpeed,
            });
        }

        const { fuelBurned, timeElapsed, distanceTraveled } = this.computeCruiseSegment(topOfDescent.distanceFromStart - distanceFromStart, startOfCruise.remainingFuelOnBoard);
        distanceFromStart += distanceTraveled;
        remainingFuelOnBoard -= fuelBurned;
        secondsFromPresent += timeElapsed * 60;

        return { remainingFuelOnBoardAtTopOfDescent: remainingFuelOnBoard, secondsFromPresentAtTopOfDescent: secondsFromPresent };
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
