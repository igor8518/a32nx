/**
 * Theoretical descent path model
 */
export interface TheoreticalDescentPathCharacteristics {
    tod: number,
    remainingFuelOnBoardAtTopOfDescent: number,
    fuelBurnedDuringDescent: number,
}

export interface IdlePath {
    speedLimitStartDistanceFromEnd: NauticalMiles,
    speedLimitValue: Knots,
}

export interface GeometricPath {
    /**
     * Table of flight path angles indexed by the leg whose termination they end up at
     */
    flightPathAngles: {
        [k: number]: Degrees,
    },
}
