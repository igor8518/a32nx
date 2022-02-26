import { WindComponent, WindVector } from '@fmgc/guidance/vnav/wind';
import { WindForecastInputs } from '@fmgc/guidance/vnav/wind/WindForecastInputs';
import { WindObserver } from '@fmgc/guidance/vnav/wind/WindObserver';

export class ClimbWindProfile {
    constructor(private inputs: WindForecastInputs, private measurementDevice: WindObserver) { }

    interpolateByAltitude(altitude: Feet): WindVector {
        if (this.inputs.climbWinds.length === 0) {
            return WindVector.default();
        }

        if (altitude <= this.inputs.climbWinds[0].altitude) {
            return this.inputs.climbWinds[0].vector;
        }

        for (let i = 0; i < this.inputs.climbWinds.length - 1; i++) {
            if (altitude > this.inputs.climbWinds[i].altitude && altitude <= this.inputs.climbWinds[i + 1].altitude) {
                const scaling = (altitude - this.inputs.climbWinds[i].altitude) / (this.inputs.climbWinds[i + 1].altitude - this.inputs.climbWinds[i].altitude);

                return new WindVector(
                    (1 - scaling) * this.inputs.climbWinds[i].vector.direction + scaling * this.inputs.climbWinds[i + 1].vector.direction,
                    (1 - scaling) * this.inputs.climbWinds[i].vector.speed + scaling * this.inputs.climbWinds[i + 1].vector.speed,
                );
            }
        }

        return this.inputs.climbWinds[this.inputs.climbWinds.length - 1].vector;
    }

    getHeadwindComponent(planeDistanceFromStart: NauticalMiles, distanceFromStart: NauticalMiles, altitude: Feet, planeHeading: DegreesTrue): WindComponent {
        if (this.inputs.climbWinds.length === 0) {
            return this.inputs.tripWind;
        }

        // Get forecast
        const forecast = this.interpolateByAltitude(altitude);
        const measurement = this.measurementDevice.get();

        const distanceBetweenToAirplane = distanceFromStart - planeDistanceFromStart;

        if (distanceBetweenToAirplane < 0) {
            console.warn('[FMS/VNAV] Wind prediction made for point behind aircraft');
        }

        if (!measurement || distanceBetweenToAirplane > 0) {
            return WindComponent.fromVector(forecast, planeHeading);
        }

        const scaling = Math.min(1, (distanceFromStart - planeDistanceFromStart) / 200);

        return WindComponent.fromVector(this.interpolateVectors(measurement, forecast, scaling), planeHeading);
    }

    private interpolateVectors(vector1: WindVector, vector2: WindVector, scaling: number): WindVector {
        return new WindVector(
            (1 - scaling) * vector1.direction + scaling * vector2.direction,
            (1 - scaling) * vector1.speed + scaling * vector2.speed,
        );
    }
}
