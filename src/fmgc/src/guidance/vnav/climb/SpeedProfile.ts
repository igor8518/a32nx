import { MaxSpeedConstraint } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { SpeedLimit } from '@fmgc/guidance/vnav/SpeedLimit';

interface ClimbSpeedProfileParameters {
    fcuSpeed: Knots | Mach,
    managedClimbSpeed: Knots,
    speedLimit: SpeedLimit,
    flightPhase: FlightPhase,
    preselectedClbSpeed: Knots,
}

export interface SpeedProfile {
    get(distanceFromStart: NauticalMiles, altitude: Feet): Knots;
    getCurrentSpeedConstraint(): Knots;
}

/**
 * This class's purpose is to provide a predicted speed at a given position and altitude.
 */
export class McduSpeedProfile implements SpeedProfile {
    private maxSpeedCacheHits: number = 0;

    private maxSpeedLookups: number = 0;

    private maxSpeedCache: Map<number, Knots> = new Map();

    constructor(
        private parameters: ClimbSpeedProfileParameters,
        private aircraftDistanceAlongTrack: NauticalMiles,
        private maxSpeedConstraints: MaxSpeedConstraint[],
    ) { }

    private isValidSpeedLimit(): boolean {
        const { speed, underAltitude } = this.parameters.speedLimit;

        return Number.isFinite(speed) && Number.isFinite(underAltitude);
    }

    private withSpeedLimitIfApplicable(altitude: Feet, fallbackSpeed: Knots): Knots {
        const { speed, underAltitude } = this.parameters.speedLimit;

        if (this.isValidSpeedLimit() && altitude < underAltitude) {
            return Math.min(speed, fallbackSpeed);
        }

        return fallbackSpeed;
    }

    get(distanceFromStart: NauticalMiles, altitude: Feet): Knots {
        const { fcuSpeed, flightPhase, preselectedClbSpeed } = this.parameters;

        const hasPreselectedSpeed = flightPhase < FlightPhase.FLIGHT_PHASE_CLIMB && preselectedClbSpeed > 1;
        const hasSelectedSpeed = fcuSpeed > 1;

        if (!hasPreselectedSpeed && !hasSelectedSpeed) {
            return this.getManaged(distanceFromStart, altitude);
        }

        const nextSpeedChange = this.findDistanceAlongTrackOfNextSpeedChange(this.aircraftDistanceAlongTrack);

        if (distanceFromStart > nextSpeedChange) {
            return this.getManaged(distanceFromStart, altitude);
        }

        if (hasPreselectedSpeed) {
            return preselectedClbSpeed;
        }

        return fcuSpeed;
    }

    private getManaged(distanceFromStart: NauticalMiles, altitude: Feet): Knots {
        let managedClimbSpeed = this.parameters.managedClimbSpeed;

        managedClimbSpeed = this.withSpeedLimitIfApplicable(altitude, managedClimbSpeed);

        return Math.min(managedClimbSpeed, this.findMaxSpeedAtDistanceAlongTrack(distanceFromStart));
    }

    getCurrentSpeedConstraint(): Knots {
        return this.findMaxSpeedAtDistanceAlongTrack(this.aircraftDistanceAlongTrack);
    }

    private findMaxSpeedAtDistanceAlongTrack(distanceAlongTrack: NauticalMiles): Knots {
        this.maxSpeedLookups++;

        const cachedMaxSpeed = this.maxSpeedCache.get(distanceAlongTrack);
        if (cachedMaxSpeed) {
            this.maxSpeedCacheHits++;
            return cachedMaxSpeed;
        }

        let maxSpeed = Infinity;

        for (const constraint of this.maxSpeedConstraints) {
            if (distanceAlongTrack <= constraint.distanceFromStart && constraint.maxSpeed < maxSpeed) {
                maxSpeed = constraint.maxSpeed;
            }
        }

        this.maxSpeedCache.set(distanceAlongTrack, maxSpeed);

        return maxSpeed;
    }

    private findDistanceAlongTrackOfNextSpeedChange(distanceAlongTrack: NauticalMiles) {
        let distance = Infinity;

        for (const constraint of this.maxSpeedConstraints) {
            if (distanceAlongTrack <= constraint.distanceFromStart && constraint.distanceFromStart < distance) {
                distance = constraint.distanceFromStart;
            }
        }

        // TODO: Handle speed limit

        return distance;
    }

    showDebugStats() {
        if (this.maxSpeedLookups === 0) {
            console.log('[FMS/VNAV] No max speed lookups done so far.');
            return;
        }

        console.log(
            `[FMS/VNAV] Performed ${this.maxSpeedLookups} max speed lookups. Of which ${this.maxSpeedCacheHits} (${100 * this.maxSpeedCacheHits / this.maxSpeedLookups}%) had been cached`,
        );
    }
}

export class ExpediteSpeedProfile implements SpeedProfile {
    constructor(private greenDotSpeed: Knots) { }

    get(_distanceFromStart: number, _altitude: number): Knots {
        return this.greenDotSpeed;
    }

    getCurrentSpeedConstraint(): Knots {
        return Infinity;
    }
}

/**
 * The NdSpeedProfile is different from the MCDU speed profile because it assumes a selected speed is
 * held until the end of the flight phase rather than only until the next speed constraint
 */
export class NdSpeedProfile implements SpeedProfile {
    private maxSpeedCacheHits: number = 0;

    private maxSpeedLookups: number = 0;

    private maxSpeedCache: Map<number, Knots> = new Map();

    constructor(
        private parameters: ClimbSpeedProfileParameters,
        private aircraftDistanceAlongTrack: NauticalMiles,
        private maxSpeedConstraints: MaxSpeedConstraint[],
    ) { }

    private isValidSpeedLimit(): boolean {
        const { speed, underAltitude } = this.parameters.speedLimit;

        return Number.isFinite(speed) && Number.isFinite(underAltitude);
    }

    private withSpeedLimitIfApplicable(altitude: Feet, fallbackSpeed: Knots): Knots {
        const { speed, underAltitude } = this.parameters.speedLimit;

        if (this.isValidSpeedLimit() && altitude < underAltitude) {
            return Math.min(speed, fallbackSpeed);
        }

        return fallbackSpeed;
    }

    get(distanceFromStart: NauticalMiles, altitude: Feet): Knots {
        const { fcuSpeed, flightPhase, preselectedClbSpeed } = this.parameters;

        const hasPreselectedSpeed = flightPhase < FlightPhase.FLIGHT_PHASE_CLIMB && preselectedClbSpeed > 1;
        const hasSelectedSpeed = fcuSpeed > 1;

        if (hasPreselectedSpeed) {
            return preselectedClbSpeed;
        }

        if (hasSelectedSpeed) {
            return fcuSpeed;
        }

        return this.getManaged(distanceFromStart, altitude);
    }

    private getManaged(distanceFromStart: NauticalMiles, altitude: Feet): Knots {
        let managedClimbSpeed = this.parameters.managedClimbSpeed;

        managedClimbSpeed = this.withSpeedLimitIfApplicable(altitude, managedClimbSpeed);

        return Math.min(managedClimbSpeed, this.findMaxSpeedAtDistanceAlongTrack(distanceFromStart));
    }

    getCurrentSpeedConstraint(): Knots {
        return this.findMaxSpeedAtDistanceAlongTrack(this.aircraftDistanceAlongTrack);
    }

    private findMaxSpeedAtDistanceAlongTrack(distanceAlongTrack: NauticalMiles): Knots {
        this.maxSpeedLookups++;

        const cachedMaxSpeed = this.maxSpeedCache.get(distanceAlongTrack);
        if (cachedMaxSpeed) {
            this.maxSpeedCacheHits++;
            return cachedMaxSpeed;
        }

        let maxSpeed = Infinity;

        for (const constraint of this.maxSpeedConstraints) {
            if (distanceAlongTrack <= constraint.distanceFromStart && constraint.maxSpeed < maxSpeed) {
                maxSpeed = constraint.maxSpeed;
            }
        }

        this.maxSpeedCache.set(distanceAlongTrack, maxSpeed);

        return maxSpeed;
    }

    showDebugStats() {
        if (this.maxSpeedLookups === 0) {
            console.log('[FMS/VNAV] No max speed lookups done so far.');
            return;
        }

        console.log(
            `[FMS/VNAV] Performed ${this.maxSpeedLookups} max speed lookups. Of which ${this.maxSpeedCacheHits} (${100 * this.maxSpeedCacheHits / this.maxSpeedLookups}%) had been cached`,
        );
    }
}
