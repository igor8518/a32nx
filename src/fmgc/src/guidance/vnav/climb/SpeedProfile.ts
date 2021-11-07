import { MaxSpeedConstraint } from '@fmgc/guidance/vnav/GeometryProfile';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';

export class ClimbSpeedProfile {
    private maxSpeedCacheHits: number = 0;

    private maxSpeedLookups: number = 0;

    private maxSpeedCache: Map<number, Knots> = new Map();

    private maxSpeedConstraints: MaxSpeedConstraint[];

    constructor(private observer: VerticalProfileComputationParametersObserver) { }

    updateMaxSpeedConstraints(maxSpeedConstraints: MaxSpeedConstraint[]) {
        this.maxSpeedConstraints = maxSpeedConstraints;

        this.maxSpeedCacheHits = 0;
        this.maxSpeedLookups = 0;
        this.maxSpeedCache.clear();
    }

    private isValidSpeedLimit(): boolean {
        const { speed, underAltitude } = this.observer.get().speedLimit;

        return Number.isFinite(speed) && Number.isFinite(underAltitude);
    }

    withSpeedLimitIfApplicable(altitude: Feet, fallbackSpeed: Knots): Knots {
        const { speed, underAltitude } = this.observer.get().speedLimit;

        if (this.isValidSpeedLimit() && altitude < underAltitude) {
            return Math.min(speed, fallbackSpeed);
        }

        return speed;
    }

    getManaged(distanceFromStart: NauticalMiles, altitude: Feet): Knots {
        let managedClimbSpeed = this.observer.get().managedClimbSpeed;

        managedClimbSpeed = this.withSpeedLimitIfApplicable(altitude, managedClimbSpeed);

        return Math.min(managedClimbSpeed, this.findMaxSpeedAtDistanceAlongTrack(distanceFromStart));
    }

    findMaxSpeedAtDistanceAlongTrack(distanceAlongTrack: NauticalMiles): Knots {
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
