import { FlapConf } from './common';

export class FlightModel {
    static Cd0 = 0.0237;

    static wingSpan = 117.5;

    static wingArea = 1313.2;

    static wingEffcyFactor = 0.75;

    /**
     * Get lift coefficient at given conditions
     * @param weight in pounds
     * @param mach self-explanatory
     * @param delta pressure at the altitude divided by the pressure at sea level
     * @param loadFactor g-Force
     * @returns lift coefficient (Cl)
     */
    static getLiftCoefficient(weight: number, mach: number, delta: number, loadFactor = 1): number {
        return (weight * loadFactor) / (1481.4 * (mach ** 2) * delta * this.wingArea);
    }

    /**
     * Get drag coefficient at given conditions
     * @param weight in pounds
     * @param mach self-explanatory
     * @param delta pressure at the altitude divided by the pressure at sea level
     * @param spdBrkDeflected whether speedbrake is deflected at half or not
     * @param gearExtended whether gear is extended or not
     * @param flapConf flap configuration
     * @returns drag coefficient (Cd)
     */
    static getDragCoefficient(weight: number, mach: number, delta: number, spdBrkDeflected = false, gearExtended = false, flapConf = FlapConf.CLEAN) : number {
        const Cl = this.getLiftCoefficient(weight, mach, delta);

        // Values taken at mach 0.78
        let baseDrag;
        switch (flapConf) {
        case FlapConf.CLEAN:
            baseDrag = (0.0384 * Cl ** 5) - (0.1385 * Cl ** 4) + (0.1953 * Cl ** 3) - (0.0532 * Cl ** 2) - (0.0052 * Cl) + 0.0259;
            break;
        case FlapConf.CONF_1:
            baseDrag = (0.0438 * Cl ** 5) - (0.1911 * Cl ** 4) + (0.3215 * Cl ** 3) - (0.1801 * Cl ** 2) + (0.0281 * Cl) + 0.0441;
            break;
        case FlapConf.CONF_2:
            baseDrag = (0.0116 * Cl ** 5) - (0.0593 * Cl ** 4) + (0.1292 * Cl ** 3) - (0.0858 * Cl ** 2) + (0.0043 * Cl) + 0.0895;
            break;
        case FlapConf.CONF_3:
            baseDrag = (0.01 * Cl ** 5) - (0.0558 * Cl ** 4) + (0.1325 * Cl ** 3) - (0.1019 * Cl ** 2) + (0.0123 * Cl) + 0.1004;
            break;
        case FlapConf.CONF_FULL:
            baseDrag = (0.0014 * Cl ** 5) - (0.0097 * Cl ** 4) + (0.0369 * Cl ** 3) - (0.0222 * Cl ** 2) - (0.0201 * Cl) + 0.1534;
            break;
        default:
            break;
        }

        const spdBrkIncrement = spdBrkDeflected ? 0.01 : 0;
        const gearIncrement = gearExtended ? 0.03 : 0;
        return baseDrag + spdBrkIncrement + gearIncrement;
    }

    /**
     * Get drag at given conditions
     * @param weight in pounds
     * @param mach self-explanatory
     * @param delta pressure at the altitude divided by the pressure at sea level
     * @param spdBrkDeflected Whether speedbrake is deflected at half or not
     * @param gearExtended whether gear is extended or not
     * @param flapConf flap configuration
     * @returns drag
     */
    static getDrag(weight: number, mach: number, delta: number, spdBrkDeflected: boolean, gearExtended: boolean, flapConf: FlapConf): number {
        const Cd = this.getDragCoefficient(weight, mach, delta, spdBrkDeflected, gearExtended, flapConf);
        return 1481.4 * (mach ** 2) * delta * this.wingArea * Cd;
    }

    /**
     * Gets acceleration factor for altitudes below troposphere
     * @param mach self-explanatory
     * @param temp actual temperature in Kelvin
     * @param stdTemp standard day temperature in Kelvin
     * @returns acceleration factor
     */
    static getAccelerationFactorBelowTropo(mach: number, temp: number, stdTemp: number): number {
        return 1 - (0.133184 * mach ** 2) * (stdTemp / temp);
    }

    /**
     * Gets acceleration factor for altitudes above troposphere
     * @param mach self-explanatory
     * @param flyingAtConstantMach if aircraft is flying at a constant mach
     * @returns acceleration factor
     */
    static getAccelerationFactorAboveTropo(mach: number, flyingAtConstantMach: boolean): number {
        if (flyingAtConstantMach) {
            return 1;
        }

        const phi = (((1 + 0.2 * mach ** 2) ** 3.5) - 1) / ((0.7 * mach ** 2) * (1 + 0.2 * mach ** 2) ** 2.5);
        return 1 + (0.7 * mach ** 2) * phi;
    }

    /**
     * Placeholder
     * @param mach
     * @param temp
     * @param stdTemp
     * @param altitude
     * @param tropoAlt
     * @param flyingAtConstantMach
     * @returns
     */
    static getAccelerationFactor(
        mach: number,
        temp: number,
        stdTemp: number,
        altitude: number,
        tropoAlt: number,
        flyingAtConstantMach: boolean,
    ): number {
        if (altitude >= tropoAlt) {
            return this.getAccelerationFactorAboveTropo(mach, flyingAtConstantMach);
        }
        return this.getAccelerationFactorBelowTropo(mach, temp, stdTemp);
    }

    static getConstantThrustPathAngle(
        thrust: number,
        weight: number,
        drag: number,
        accelFactor: number,
    ): number {
        return Math.asin(((thrust - drag) / weight) / accelFactor);
    }

    /**
     * Gets distance required to accelerate/decelerate
     * @param thrust
     * @param drag
     * @param weight in pounds
     * @param initialSpeed
     * @param targetSpeed
     * @param fpa flight path angle, default value 0 for level segments
     * @param accelFactor acceleration factor, default value 0 for level segments
     * @returns distance to accel/decel
     */
    static getAccelerationDistance(
        thrust: number,
        drag: number,
        weight: number,
        initialSpeed: number,
        targetSpeed: number,
        fpa = 0,
        accelFactor = 0,
    ): number {
        const sign = Math.sign(fpa);
        const force = thrust - drag + (sign * weight * Math.sin(fpa * (Math.PI / 180))) * accelFactor;

        const accel = force / weight; // TODO: Check units
        const timeToAccel = (targetSpeed - initialSpeed) / accel;
        const distanceToAccel = (initialSpeed * timeToAccel) + (0.5 * accel * (timeToAccel ** 2)); // TODO: Check units
        return distanceToAccel;
    }
}
