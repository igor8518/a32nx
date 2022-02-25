import { Fmgc } from '@fmgc/guidance/GuidanceController';
import { ClimbWindProfile } from '@fmgc/guidance/vnav/wind/ClimbWindProfile';
import { WindForecastInputObserver } from '@fmgc/guidance/vnav/wind/WindForecastInputObserver';
import { WindObserver } from '@fmgc/guidance/vnav/wind/WindObserver';

export class WindProfileFactory {
    private windObserver: WindObserver;

    private windInputObserver: WindForecastInputObserver

    constructor(fmgc: Fmgc, fmgcSide: number) {
        this.windObserver = new WindObserver(fmgcSide);
        this.windInputObserver = new WindForecastInputObserver(fmgc);
    }

    updateFmgcInputs() {
        this.windInputObserver.update();
    }

    getClimbWinds(): ClimbWindProfile {
        return new ClimbWindProfile(
            this.windInputObserver.get(),
            this.windObserver,
        );
    }
}
