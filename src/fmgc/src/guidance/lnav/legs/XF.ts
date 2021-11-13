import { Leg } from '@fmgc/guidance/lnav/legs/Leg';

export abstract class XFLeg extends Leg {
    fix: WayPoint;

    get terminationWaypoint(): WayPoint {
        return this.fix;
    }

    get ident(): string {
        return this.fix.ident;
    }
}
