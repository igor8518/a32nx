import { SpeedLimit } from '@fmgc/guidance/vnav/SpeedLimit';

export class SpeedMargin {
    private vmo: Knots = 350;

    private mmo: Mach = 0.82;

    constructor(private managedDescentSpeed: Knots, speedLimit: SpeedLimit) { }

    getTarget(indicatedAirspeed: Knots): Knots {
        const [lowerMargin, upperMargin] = this.getMargins();

        return Math.max(Math.min(indicatedAirspeed, upperMargin), lowerMargin);
    }

    getMargins(): [Knots, Knots] {
        const vmax = SimVar.GetSimVarValue('L:A32NX_SPEEDS_VMAX', 'number');
        const vls = SimVar.GetSimVarValue('L:A32NX_SPEEDS_VLS', 'number');

        const mmoAsIas = SimVar.GetGameVarValue('FROM MACH TO KIAS', 'number', this.mmo);

        return [
            Math.max(vls, this.managedDescentSpeed - 20),
            Math.min(vmax, this.vmo - 3, mmoAsIas - 0.006, this.managedDescentSpeed + 20),
        ];
    }
}
