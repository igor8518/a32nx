import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';
import { StepCoordinator } from '@fmgc/guidance/vnav/StepCoordinator';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { ClimbStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
import { Predictions, StepResults } from '../Predictions';
import { NavGeometryProfile, VerticalCheckpointReason } from '../profile/NavGeometryProfile';
import { AtmosphericConditions } from '../AtmosphericConditions';

export interface CruisePathBuilderResults {
    remainingFuelOnBoardAtTopOfDescent: number,
}

export class CruisePathBuilder {
    constructor(private computationParametersObserver: VerticalProfileComputationParametersObserver,
        private atmosphericConditions: AtmosphericConditions,
        private stepCoordinator: StepCoordinator) { }

    update() {
        this.atmosphericConditions.update();
    }

    computeCruisePath(profile: NavGeometryProfile, climbStrategy: ClimbStrategy): CruisePathBuilderResults {
        const topOfClimb = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfClimb);
        const topOfDescent = profile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfDescent);

        if (!topOfClimb?.distanceFromStart || !topOfDescent?.distanceFromStart) {
            return null;
        }

        if (topOfClimb.distanceFromStart > topOfDescent.distanceFromStart) {
            console.warn('[FMS/VNAV] Cruise segment too short');
            return null;
        }

        const { managedCruiseSpeed, managedCruiseSpeedMach } = this.computationParametersObserver.get();

        // Steps
        let { distanceFromStart, altitude, remainingFuelOnBoard, secondsFromPresent } = topOfClimb;

        const steps = this.stepCoordinator.steps;
        for (const step of steps) {
            // TODO: What happens if the step is at cruise altitude?
            const isClimbVsDescent = step.toAltitude > altitude;
            if (!isClimbVsDescent) {
                if (VnavConfig.DEBUG_PROFILE) {
                    console.warn(`[FMS/VNAV] Ignoring step descent at ${step.ident} because they are not supported yet.`);
                }

                continue;
            }

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
            secondsFromPresent += timeElapsed * 60;

            profile.addCheckpointAtDistanceFromStart(stepDistanceFromStart, {
                reason: isClimbVsDescent ? VerticalCheckpointReason.StepClimb : VerticalCheckpointReason.StepDescent,
                altitude,
                secondsFromPresent,
                remainingFuelOnBoard,
                speed: managedCruiseSpeed,
            });

            const { fuelBurned: fuelBurnedStep, timeElapsed: timeElapsedStep, distanceTraveled: distanceTraveledStep } = climbStrategy.predictClimb(
                altitude, step.toAltitude, managedCruiseSpeed, managedCruiseSpeedMach, remainingFuelOnBoard,
            );

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

        const { fuelBurned, timeElapsed, distanceTraveled } = this.computeCruiseSegment(topOfDescent.distanceFromStart - distanceFromStart, topOfClimb.remainingFuelOnBoard);
        distanceFromStart += distanceTraveled;
        remainingFuelOnBoard -= fuelBurned;
        secondsFromPresent += timeElapsed * 60;

        return { remainingFuelOnBoardAtTopOfDescent: remainingFuelOnBoard };
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
