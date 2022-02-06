import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { FlapConf } from '@fmgc/guidance/vnav/common';
import { Predictions, StepResults } from '@fmgc/guidance/vnav/Predictions';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';

export interface DescentStrategy {
    /**
     * Computes predictions for a single segment using the atmospheric conditions in the middle.
     * @param initialAltitude Altitude at the start of climb
     * @param finalAltitude Altitude to terminate the climb
     * @param speed
     * @param mach
     * @param fuelOnBoard Remainging fuel on board at the start of the climb
     * @returns `StepResults`
     */
    predictToAltitude(initialAltitude: number, finalAltitude: number, speed: Knots, mach: Mach, fuelOnBoard: number): StepResults;

    predictToDistance(initialAltitude: number, distance: NauticalMiles, speed: Knots, mach: Mach, fuelOnBoard: number): StepResults;
}

export class IdleDescentStrategy implements DescentStrategy {
    constructor(private observer: VerticalProfileComputationParametersObserver, private atmosphericConditions: AtmosphericConditions) { }

    predictToAltitude(initialAltitude: number, finalAltitude: number, speed: number, mach: number, fuelOnBoard: number): StepResults {
        const { zeroFuelWeight, perfFactor, tropoPause, managedDescentSpeedMach } = this.observer.get();

        const midwayAltitude = (initialAltitude + finalAltitude) / 2;
        const predictedN1 = 26 + ((midwayAltitude / 36000) * (30 - 26));

        return Predictions.altitudeStep(
            initialAltitude,
            finalAltitude - initialAltitude,
            speed,
            managedDescentSpeedMach,
            predictedN1,
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

    predictToDistance(initialAltitude: number, distance: number, speed: number, mach: number, fuelOnBoard: number): StepResults {
        const { zeroFuelWeight, perfFactor, tropoPause, managedDescentSpeedMach } = this.observer.get();

        const predictedN1 = 26 + ((initialAltitude / 36000) * (30 - 26));

        return Predictions.altitudeStep(
            initialAltitude,
            distance,
            speed,
            managedDescentSpeedMach,
            predictedN1,
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
}
