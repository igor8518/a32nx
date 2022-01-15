import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';
import { EngineModel } from '../EngineModel';
import { FlapConf } from '../common';
import { Predictions, StepResults } from '../Predictions';
import { AtmosphericConditions } from '../AtmosphericConditions';

export interface ClimbStrategy {
    /**
     * Computes predictions for a single segment using the atmospheric conditions in the middle.
     * @param initialAltitude Altitude at the start of climb
     * @param finalAltitude Altitude to terminate the climb
     * @param speed
     * @param mach
     * @param fuelOnBoard Remainging fuel on board at the start of the climb
     * @returns `StepResults`
     */
    predictClimb(initialAltitude: number, finalAltitude: number, speed: Knots, mach: Mach, fuelOnBoard: number): StepResults;
}

export class VerticalSpeedClimbStrategy implements ClimbStrategy {
    constructor(private observer: VerticalProfileComputationParametersObserver, private atmosphericConditions: AtmosphericConditions, private verticalSpeed: FeetPerMinute) { }

    predictClimb(initialAltitude: Feet, finalAltitude: Feet, speed: Knots, mach: Mach, fuelOnBoard: number): StepResults {
        const { zeroFuelWeight, perfFactor } = this.observer.get();

        return Predictions.verticalSpeedStep(
            initialAltitude,
            finalAltitude,
            this.verticalSpeed,
            speed,
            mach,
            zeroFuelWeight * Constants.TONS_TO_POUNDS,
            fuelOnBoard * Constants.TONS_TO_POUNDS,
            this.atmosphericConditions.isaDeviation,
            perfFactor,
        );
    }
}

export class ClimbThrustClimbStrategy implements ClimbStrategy {
    constructor(private observer: VerticalProfileComputationParametersObserver, private atmosphericConditions: AtmosphericConditions) { }

    predictClimb(initialAltitude: Feet, finalAltitude: Feet, speed: Knots, mach: Mach, fuelOnBoard: number): StepResults {
        const { zeroFuelWeight, tropoPause, perfFactor } = this.observer.get();

        return Predictions.altitudeStep(
            initialAltitude,
            finalAltitude - initialAltitude,
            speed,
            mach,
            this.getClimbThrustN1Limit((initialAltitude + finalAltitude) / 2, speed),
            zeroFuelWeight * Constants.TONS_TO_POUNDS,
            fuelOnBoard,
            0,
            this.atmosphericConditions.isaDeviation,
            tropoPause,
            false,
            FlapConf.CLEAN,
            perfFactor,
        );
    }

    private getClimbThrustN1Limit(altitude: Feet, speed: Knots) {
        // This Mach number is the Mach number for the predicted climb speed, not the Mach to use after crossover altitude.
        const climbSpeedMach = this.atmosphericConditions.computeMachFromCas(altitude, speed);
        const estimatedTat = this.atmosphericConditions.totalAirTemperatureFromMach(altitude, climbSpeedMach);

        return EngineModel.tableInterpolation(EngineModel.maxClimbThrustTableLeap, estimatedTat, altitude);
    }
}
