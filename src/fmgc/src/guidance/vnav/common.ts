export enum FlapConf {
    CLEAN,
    CONF_1,
    CONF_2,
    CONF_3,
    CONF_FULL
}

export class Common {
    /**
     * Get temperature ratio for a particular altitude.
     * @param alt altitude
     * @returns temperature ratio
     */
    static getTheta(alt: number): number {
        return (288.15 - 1.98 * alt / 1000) / 288.15;
    }

    /**
     * Get temperature ratio for a particular altitude and mach.
     * @param theta temperature ratio (from only altitude)
     * @param mach mach
     * @returns temperature ratio
     */
    static getTheta2(theta: number, mach: number): number {
        return theta * (1 + 0.2 * (mach ** 2));
    }

    /**
     * Get pressure ratio for a particular theta
     * @param theta temperature ratio
     * @returns pressure ratio
     */
    static getDelta(theta: number): number {
        return theta ** 5.256;
    }

    /**
     * Get pressure ratio for a particular theta and mach
     * @param delta pressure ratio (from only theta)
     * @param mach mach
     * @returns pressure ratio
     */
    static getDelta2(delta: number, mach: number): number {
        return delta * (1 + 0.2 * (mach ** 2)) ** 3.5;
    }

    /**
     * Get KTAS value from mach
     * @param mach
     * @param theta
     * @returns speed in KTAS (knots true airspeed)
     */
    static machToTAS(mach: number, theta: number): number {
        return 661.4786 * mach * Math.sqrt(theta);
    }

    static TAStoCAS(tas: number, theta: number, delta: number): number {
        const term1 = 1 + (1 / theta) * (tas / 1479.1) ** 2;
        const term2 = delta * ((term1 ** 3.5) - 1) + 1;
        const term3 = ((term2) ** (1 / 3.5)) - 1;
        return 1479.1 * Math.sqrt(term3);
    }

    static interpolate(x: number, x0: number, x1: number, y0: number, y1: number): number {
        return ((y0 * (x1 - x)) + (y1 * (x - x0))) / (x1 - x0);
    }

    static poundsToMetricTons(pounds: number): number {
        return pounds / 2204.6;
    }
}
