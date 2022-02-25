import { Fmgc } from '@fmgc/guidance/GuidanceController';
import { WindComponent, WindVector, WindVectorAtAltitude } from '@fmgc/guidance/vnav/wind';
import { WindForecastInputs } from '@fmgc/guidance/vnav/wind/WindForecastInputs';

export class WindForecastInputObserver {
    private inputs: WindForecastInputs

    constructor(private fmgc: Fmgc) {
        this.inputs = {
            tripWind: new WindComponent(0),
            climbWinds: [],
            cruiseWindsByWaypoint: new Map<number, WindVectorAtAltitude[]>(),
            descentWinds: [],
            destinationWind: new WindVector(0, 0),
        };

        this.update();
    }

    update() { }

    get(): WindForecastInputs {
        return this.inputs;
    }

    get tripWind(): WindComponent {
        return this.inputs.tripWind;
    }

    get climbWinds(): WindVectorAtAltitude[] {
        return this.inputs.climbWinds;
    }

    get cruiseWindsByWaypoint(): Map<number, WindVectorAtAltitude[]> {
        return this.inputs.cruiseWindsByWaypoint;
    }

    get descentWinds(): WindVectorAtAltitude[] {
        return this.inputs.descentWinds;
    }

    get destinationWind(): WindVector {
        return this.inputs.destinationWind;
    }
}
