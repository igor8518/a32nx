import { FlightPlanManager } from '@fmgc/wtsdk';

export interface Step {
    ident: string,
    toAltitude: Feet,
    location: LatLongAlt
}

class GeographicalStep implements Step {
    constructor(private waypoint: WayPoint, public waypointIndex: number, public toAltitude: Feet) {}

    get ident(): string {
        return this.waypoint.ident;
    }

    get location(): LatLongAlt {
        return this.waypoint.infos.coordinates;
    }
}

export class StepCoordinator {
    steps: Step[] = [];

    constructor(private flightPlanManager: FlightPlanManager) {}

    requestToAddGeometricStep(waypointIdent: string, toAltitude: Feet): boolean {
        const [index, waypoint] = this.findWaypoint(waypointIdent);

        if (!waypoint) {
            return false;
        }

        this.steps.push(new GeographicalStep(waypoint, index, toAltitude));

        return true;
    }

    requestToAddOptimalStep(): boolean {
        return false;
    }

    removeStep(index: number) {
        this.steps.splice(index, 1);
    }

    private findWaypoint(ident: string): [number, WayPoint | undefined] {
        for (let i = 0; i < this.flightPlanManager.getWaypointsCount(); i++) {
            const waypoint = this.flightPlanManager.getWaypoint(i);

            if (!waypoint) {
                continue;
            }

            if (this.flightPlanManager.getWaypoint(i).ident === ident) {
                return [i, waypoint];
            }
        }

        return [-1, undefined];
    }
}
