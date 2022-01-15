import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';
import { StepCoordinator } from '@fmgc/guidance/vnav/StepCoordinator';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
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

        // Steps
        let { distanceFromStart, altitude, remainingFuelOnBoard, secondsFromPresent } = topOfClimb;

        const steps = this.stepCoordinator.steps;
        for (const step of steps) {
            // TODO: What happens if the step is at cruise altitude?
            const isClimbVsDescent = step.toAltitude > altitude;
            const stepDistanceFromStart = step.distanceFromStart;

            if (stepDistanceFromStart < topOfClimb.distanceFromStart || stepDistanceFromStart > topOfDescent.distanceFromStart) {
                if (VnavConfig.DEBUG_PROFILE) {
                    console.warn(
                        `[FMS/VNAV] Cruise step is not within cruise segment \
                        (${stepDistanceFromStart.toFixed(2)} NM, T/C: ${topOfClimb.distanceFromStart.toFixed(2)} NM, T/D: ${topOfDescent.distanceFromStart.toFixed(2)} NM)`,
                    );
                }

                continue;
            }

            const { fuelBurned, timeElapsed, distanceTraveled } = this.computeCruiseSegment(stepDistanceFromStart - distanceFromStart, remainingFuelOnBoard);

            distanceFromStart += distanceTraveled;
            remainingFuelOnBoard -= fuelBurned;
            secondsFromPresent += timeElapsed;

            profile.addCheckpointAtDistanceFromStart(stepDistanceFromStart, {
                reason: isClimbVsDescent ? VerticalCheckpointReason.StepClimb : VerticalCheckpointReason.StepDescent,
                altitude,
                secondsFromPresent,
                remainingFuelOnBoard,
                speed: topOfClimb.speed,
            });

            // Compute step
            // TODO: Actual calculation
            const { fuelBurnedStep, timeElapsedStep, distanceTraveledStep } = { fuelBurnedStep: 400, timeElapsedStep: 60, distanceTraveledStep: 10 };
            distanceFromStart += distanceTraveledStep;
            remainingFuelOnBoard -= fuelBurnedStep;
            secondsFromPresent += timeElapsedStep;
            altitude = step.toAltitude;

            profile.addCheckpointAtDistanceFromStart(distanceFromStart + distanceTraveledStep, {
                reason: isClimbVsDescent ? VerticalCheckpointReason.TopOfStepClimb : VerticalCheckpointReason.BottomOfStepDescent,
                secondsFromPresent,
                remainingFuelOnBoard,
                altitude,
                speed: topOfClimb.speed,
            });
        }

        const { fuelBurned, timeElapsed, distanceTraveled } = this.computeCruiseSegment(topOfDescent.distanceFromStart - distanceFromStart, topOfClimb.remainingFuelOnBoard);

        return {
            remainingFuelOnBoardAtTopOfDescent: profile.lastCheckpoint.remainingFuelOnBoard - fuelBurned,
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
