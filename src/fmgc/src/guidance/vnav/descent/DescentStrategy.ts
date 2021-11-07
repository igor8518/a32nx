import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { FlapConf } from '@fmgc/guidance/vnav/common';
import { Predictions, StepResults } from '@fmgc/guidance/vnav/Predictions';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';

export interface DescentStrategy {
    /**
     * Computes predictions for a single segment using the atmospheric conditions in the middle.
     * @param initialAltitude Altitude at the start of descent
     * @param finalAltitude Altitude to terminate the descent
     * @param speed
     * @param mach
     * @param fuelOnBoard Remainging fuel on board at the start of the descent
     * @returns `StepResults`
     */
    predictToAltitude(initialAltitude: number, finalAltitude: number, speed: Knots, mach: Mach, fuelOnBoard: number): StepResults;

    /**
     * Computes a descent step forwards
     * @param initialAltitude Altitude that you should end up at after descending
     * @param distance
     * @param speed
     * @param mach
     * @param fuelOnBoard
     */
    predictToDistance(initialAltitude: number, distance: NauticalMiles, speed: Knots, mach: Mach, fuelOnBoard: number): StepResults;

        /**
     * Computes a descent step backwards
     * @param finalAltitude Altitude that you should end up at after descending
     * @param distance
     * @param speed
     * @param mach
     * @param fuelOnBoard
     */
    predictToDistanceBackwards(finalAltitude: number, distance: NauticalMiles, speed: Knots, mach: Mach, fuelOnBoard: number): StepResults;

    /**
     * Computes a step from an initial altitude until the aircraft reaches finalSpeed
     * @param initialAltitude
     * @param speed
     * @param finalSpeed
     * @param mach
     * @param fuelOnBoard
     */
    predictToSpeed(initialAltitude: number, speed: Knots, finalSpeed: Knots, mach: Mach, fuelOnBoard: number): StepResults

    /**
     * Computes a descending deceleration backwards
     * @param finalAltitude Altitude that you should end up at after descending
     * @param finalSpeed Speed that you should be at after decelerating
     * @param speed
     * @param mach
     * @param fuelOnBoard
     */
    predictToSpeedBackwards(finalAltitude: number, finalSpeed: Knots, speed: Knots, mach: Mach, fuelOnBoard: number): StepResults;
}

export class IdleDescentStrategy implements DescentStrategy {
    constructor(private observer: VerticalProfileComputationParametersObserver, private atmosphericConditions: AtmosphericConditions) { }

    predictToAltitude(initialAltitude: number, finalAltitude: number, speed: number, mach: number, fuelOnBoard: number): StepResults {
        const { zeroFuelWeight, perfFactor, tropoPause } = this.observer.get();

        const midwayAltitude = (initialAltitude + finalAltitude) / 2;
        const predictedN1 = 30;

        return Predictions.altitudeStep(
            initialAltitude,
            finalAltitude - initialAltitude,
            speed,
            mach,
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
        const { zeroFuelWeight, perfFactor, tropoPause } = this.observer.get();

        // TODO: Fix this
        const predictedN1 = 30;

        return Predictions.distanceStep(
            initialAltitude,
            distance,
            speed,
            mach,
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

    predictToDistanceBackwards(finalAltitude: number, distance: number, speed: number, mach: number, fuelOnBoard: number): StepResults {
        const { zeroFuelWeight, perfFactor, tropoPause } = this.observer.get();

        const predictedN1 = 30;

        return Predictions.reverseDistanceStep(
            finalAltitude,
            distance,
            speed,
            mach,
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

    predictToSpeed(initialAltitude: number, speed: Knots, finalSpeed: Knots, mach: Mach, fuelOnBoard: number): StepResults {
        throw new Error('[FMS/VNAV] predictToSpeed not implemented for IdleDescentStrategy');
    }

    predictToSpeedBackwards(finalAltitude: number, finalSpeed: Knots, speed: Knots, mach: Mach, fuelOnBoard: number): StepResults {
        const { zeroFuelWeight, perfFactor, tropoPause } = this.observer.get();

        const predictedN1 = 30;

        return Predictions.reverseAltitudeStepWithSpeedChange(
            finalAltitude,
            speed,
            finalSpeed,
            mach,
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
