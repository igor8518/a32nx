import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';
import { StepCoordinator } from '@fmgc/guidance/vnav/StepCoordinator';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { ClimbStrategy, DescentStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { Predictions, StepResults } from '../Predictions';
import { VerticalCheckpoint, VerticalCheckpointReason } from '../profile/NavGeometryProfile';
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
            throw new Error('[FMS/VNAV] Start of cruise or T/D could not be located');
        }

        if (startOfCruise.distanceFromStart > topOfDescent.distanceFromStart) {
            throw new Error('[FMS/VNAV] Cruise segment too short');
        }

        const { managedCruiseSpeed, managedCruiseSpeedMach } = this.computationParametersObserver.get();

        const checkpointsToAdd: VerticalCheckpoint[] = [startOfCruise];

        for (const step of this.stepCoordinator.steps) {
            // If the step is too close to T/D
            if (step.isIgnored) {
                continue;
            }

            const { distanceFromStart, altitude, remainingFuelOnBoard } = checkpointsToAdd[checkpointsToAdd.length - 1];

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

            const segmentToStep = this.computeCruiseSegment(stepDistanceFromStart - distanceFromStart, remainingFuelOnBoard);
            this.addNewCheckpointFromResult(checkpointsToAdd, segmentToStep, isClimbVsDescent ? VerticalCheckpointReason.StepClimb : VerticalCheckpointReason.StepDescent);

            const stepResults = isClimbVsDescent
                ? stepClimbStrategy.predictToAltitude(altitude, step.toAltitude, managedCruiseSpeed, managedCruiseSpeedMach, remainingFuelOnBoard)
                : stepDescentStrategy.predictToAltitude(altitude, step.toAltitude, managedCruiseSpeed, managedCruiseSpeed, remainingFuelOnBoard);

            this.addNewCheckpointFromResult(checkpointsToAdd, stepResults, isClimbVsDescent ? VerticalCheckpointReason.TopOfStepClimb : VerticalCheckpointReason.BottomOfStepDescent);
        }

        const { fuelBurned, timeElapsed } = this.computeCruiseSegment(
            topOfDescent.distanceFromStart - checkpointsToAdd[checkpointsToAdd.length - 1].distanceFromStart,
            startOfCruise.remainingFuelOnBoard,
        );

        profile.addCheckpointAtDistanceFromStart(startOfCruise.distanceFromStart, ...checkpointsToAdd.slice(1));

        return {
            remainingFuelOnBoardAtTopOfDescent: checkpointsToAdd[checkpointsToAdd.length - 1].remainingFuelOnBoard - fuelBurned,
            secondsFromPresentAtTopOfDescent: checkpointsToAdd[checkpointsToAdd.length - 1].secondsFromPresent + timeElapsed * 60,
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

    private addNewCheckpointFromResult(existingCheckpoints: VerticalCheckpoint[], result: StepResults, reason: VerticalCheckpointReason) {
        const { distanceFromStart, secondsFromPresent, remainingFuelOnBoard } = existingCheckpoints[existingCheckpoints.length - 1];

        existingCheckpoints.push({
            reason,
            distanceFromStart: distanceFromStart + result.distanceTraveled,
            altitude: result.finalAltitude,
            secondsFromPresent: secondsFromPresent + (result.timeElapsed * 60),
            speed: result.speed,
            remainingFuelOnBoard: remainingFuelOnBoard - result.fuelBurned,
        });
    }
}
