import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { FlapConf } from '@fmgc/guidance/vnav/common';
import { EngineModel } from '@fmgc/guidance/vnav/EngineModel';
import { Predictions } from '@fmgc/guidance/vnav/Predictions';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { VerticalCheckpointReason } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { Constants } from '@shared/Constants';

export class TakeoffPathBuilder {
    constructor(private observer: VerticalProfileComputationParametersObserver, private atmosphericConditions: AtmosphericConditions) { }

    buildTakeoffPath(profile: BaseGeometryProfile) {
        this.addTakeoffRollCheckpoint(profile);
        this.buildPathToThrustReductionAltitude(profile);
        this.buildPathToAccelerationAltitude(profile);
    }

    private addTakeoffRollCheckpoint(profile: BaseGeometryProfile) {
        const { originAirfieldElevation, v2Speed, fuelOnBoard } = this.observer.get();

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.Liftoff,
            distanceFromStart: 0.6,
            secondsFromPresent: 20,
            altitude: originAirfieldElevation,
            remainingFuelOnBoard: fuelOnBoard * Constants.TONS_TO_POUNDS,
            speed: v2Speed + 10, // I know this is not perfectly accurate
        });
    }

    private buildPathToThrustReductionAltitude(profile: BaseGeometryProfile) {
        const { perfFactor, zeroFuelWeight, v2Speed, tropoPause, thrustReductionAltitude, takeoffFlapsSetting } = this.observer.get();

        const lastCheckpoint = profile.lastCheckpoint;

        const startingAltitude = lastCheckpoint.altitude;
        const predictedN1 = SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_THRUST_LIMIT_TOGA', 'Percent');
        const speed = v2Speed + 10;

        const { fuelBurned, distanceTraveled, timeElapsed } = Predictions.altitudeStep(
            startingAltitude,
            thrustReductionAltitude - startingAltitude,
            speed,
            this.atmosphericConditions.computeMachFromCas((thrustReductionAltitude + startingAltitude) / 2, speed),
            predictedN1,
            zeroFuelWeight * Constants.TONS_TO_POUNDS,
            profile.lastCheckpoint.remainingFuelOnBoard,
            0,
            this.atmosphericConditions.isaDeviation,
            tropoPause,
            false,
            takeoffFlapsSetting,
            perfFactor,
        );

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.ThrustReductionAltitude,
            distanceFromStart: profile.lastCheckpoint.distanceFromStart + distanceTraveled,
            secondsFromPresent: profile.lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
            altitude: thrustReductionAltitude,
            remainingFuelOnBoard: profile.lastCheckpoint.remainingFuelOnBoard - fuelBurned,
            speed,
        });
    }

    private buildPathToAccelerationAltitude(profile: BaseGeometryProfile) {
        const lastCheckpoint = profile.lastCheckpoint;
        const { accelerationAltitude, v2Speed, zeroFuelWeight, perfFactor, tropoPause } = this.observer.get();

        const speed = v2Speed + 10;
        const startingAltitude = lastCheckpoint.altitude;
        const midwayAltitude = (startingAltitude + accelerationAltitude) / 2;

        const machClimb = 0.76;

        const estimatedTat = this.atmosphericConditions.totalAirTemperatureFromMach(midwayAltitude, machClimb);
        const predictedN1 = EngineModel.tableInterpolation(EngineModel.maxClimbThrustTableLeap, estimatedTat, midwayAltitude);

        const { fuelBurned, distanceTraveled, timeElapsed } = Predictions.altitudeStep(
            startingAltitude,
            accelerationAltitude - startingAltitude,
            speed,
            machClimb,
            predictedN1,
            zeroFuelWeight * Constants.TONS_TO_POUNDS,
            lastCheckpoint.remainingFuelOnBoard,
            0,
            this.atmosphericConditions.isaDeviation,
            tropoPause,
            false,
            FlapConf.CLEAN,
            perfFactor,
        );

        profile.checkpoints.push({
            reason: VerticalCheckpointReason.AccelerationAltitude,
            distanceFromStart: lastCheckpoint.distanceFromStart + distanceTraveled,
            secondsFromPresent: lastCheckpoint.secondsFromPresent + (timeElapsed * 60),
            altitude: accelerationAltitude,
            remainingFuelOnBoard: lastCheckpoint.remainingFuelOnBoard - fuelBurned,
            speed,
        });
    }
}
