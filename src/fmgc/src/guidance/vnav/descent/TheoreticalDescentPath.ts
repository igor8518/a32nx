/**
 * Theoretical descent path model
 */
export interface TheoreticalDescentPathCharacteristics {
    tod: number,
    remainingFuelOnBoardAtEndOfIdlePath: number,
    remainingFuelOnBoardAtTopOfDescent: number,
    fuelBurnedDuringDescent: number,
}
