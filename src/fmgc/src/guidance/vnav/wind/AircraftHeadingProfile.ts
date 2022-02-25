import { Geometry } from '@fmgc/guidance/Geometry';
import { FlightPlanManager } from '@fmgc/wtsdk';

interface CourseAtDistance {
    distanceFromStart: NauticalMiles,
    course: DegreesTrue,
}

export class AircraftHeadingProfile {
    private courses: CourseAtDistance[] = [];

    constructor(private flightPlanManager: FlightPlanManager) { }

    get(distanceFromStart: NauticalMiles): DegreesTrue {
        if (distanceFromStart <= this.courses[0].distanceFromStart) {
            return this.courses[0].course;
        }

        for (let i = 0; i < this.courses.length; i++) {
            if (distanceFromStart > this.courses[i].distanceFromStart) {
                return this.courses[i].course;
            }
        }

        return this.courses[this.courses.length - 1].course;
    }

    updateGeometry(geometry: Geometry) {
        this.courses = [];

        const { legs, transitions } = geometry;

        let distanceFromStart = 0;

        for (let i = 0; i < this.flightPlanManager.getWaypointsCount(); i++) {
            const leg = legs.get(i);

            if (!leg) {
                continue;
            }

            const inboundTransition = transitions.get(i - 1);

            const legDistance = Geometry.completeLegPathLengths(
                leg, (inboundTransition?.isNull || !inboundTransition?.isComputed) ? null : inboundTransition, transitions.get(i),
            ).reduce((sum, el) => sum + (!Number.isNaN(el) ? el : 0), 0);

            distanceFromStart += legDistance;

            this.courses.push({
                distanceFromStart,
                course: leg.outboundCourse,
            });
        }
    }
}
