import { Leg } from '@fmgc/guidance/lnav/legs/Leg';
import { ApproachPathAngleConstraint, DescentAltitudeConstraint, MaxAltitudeConstraint, MaxSpeedConstraint } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { Geometry } from '@fmgc/guidance/Geometry';
import { AltitudeConstraintType, SpeedConstraintType } from '@fmgc/guidance/lnav/legs';
import { FlightPlans, WaypointConstraintType } from '@fmgc/flightplanning/FlightPlanManager';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { VMLeg } from '@fmgc/guidance/lnav/legs/VM';
import { PathCaptureTransition } from '@fmgc/guidance/lnav/transitions/PathCaptureTransition';
import { FixedRadiusTransition } from '@fmgc/guidance/lnav/transitions/FixedRadiusTransition';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';

export class ConstraintReader {
    public climbAlitudeConstraints: MaxAltitudeConstraint[] = [];

    public descentAltitudeConstraints: DescentAltitudeConstraint[] = [];

    public climbSpeedConstraints: MaxSpeedConstraint[] = [];

    public descentSpeedConstraints: MaxSpeedConstraint[] = [];

    public flightPathAngleConstraints: ApproachPathAngleConstraint[] = []

    public totalFlightPlanDistance = 0;

    public distanceToPresentPosition = 0;

    private distancesToEnd: Map<number, NauticalMiles> = new Map();

    public distanceToEnd: NauticalMiles = -1;

    constructor(private guidanceController: GuidanceController) {
        this.reset();
    }

    updateGeometry(geometry: Geometry, ppos: LatLongAlt) {
        this.reset();
        this.updateDistancesToEnd(geometry);

        const fpm = this.guidanceController.flightPlanManager;
        for (let i = 0; i < fpm.getWaypointsCount(FlightPlans.Active); i++) {
            const leg = geometry.legs.get(i);
            const waypoint = fpm.getWaypoint(i, FlightPlans.Active);

            this.updateDistanceFromStart(i, ppos);

            // I think this is only hit for manual discontinuities
            if (!leg) {
                continue;
            }

            if (waypoint.additionalData.constraintType === WaypointConstraintType.CLB) {
                if (this.hasValidClimbAltitudeConstraint(leg)) {
                    this.climbAlitudeConstraints.push({
                        distanceFromStart: this.totalFlightPlanDistance,
                        maxAltitude: leg.metadata.altitudeConstraint.altitude1,
                    });
                }

                if (this.hasValidClimbSpeedConstraint(leg)) {
                    this.climbSpeedConstraints.push({
                        distanceFromStart: this.totalFlightPlanDistance,
                        maxSpeed: leg.metadata.speedConstraint.speed,
                    });
                }
            } else if (waypoint.additionalData.constraintType === WaypointConstraintType.DES) {
                if (this.hasValidDescentAltitudeConstraint(leg)) {
                    this.descentAltitudeConstraints.push({
                        distanceFromStart: this.totalFlightPlanDistance,
                        constraint: leg.metadata.altitudeConstraint,
                    });
                }

                if (this.hasValidDescentSpeedConstraint(leg)) {
                    this.descentSpeedConstraints.push({
                        distanceFromStart: this.totalFlightPlanDistance,
                        maxSpeed: leg.metadata.speedConstraint.speed,
                    });
                }

                if (this.hasValidPathAngleConstraint(leg)) {
                    this.flightPathAngleConstraints.push({
                        distanceFromStart: this.totalFlightPlanDistance,
                        pathAngle: leg.metadata.pathAngleConstraint,
                    });
                }
            }
        }

        if (VnavConfig.DEBUG_PROFILE) {
            console.log(`[FMS/VNAV] Total distance: ${this.totalFlightPlanDistance}`);
        }
    }

    public updateDistanceToEnd(ppos: LatLongAlt) {
        const geometry = this.guidanceController.activeGeometry;
        const activeLegIndex = this.guidanceController.activeLegIndex;
        const activeTransIndex = this.guidanceController.activeTransIndex;

        const leg = geometry.legs.get(activeLegIndex);
        const nextWaypoint = this.guidanceController.flightPlanManager.getWaypoint(activeLegIndex, FlightPlans.Active);

        const inboundTransition = geometry.transitions.get(activeLegIndex - 1);
        const outboundTransition = geometry.transitions.get(activeLegIndex);

        const [_, legDistance, outboundLength] = Geometry.completeLegPathLengths(
            leg, (inboundTransition?.isNull || !inboundTransition?.isComputed) ? null : inboundTransition, outboundTransition,
        );

        if (activeTransIndex < 0) {
            const distanceToGo = leg instanceof VMLeg
                ? Avionics.Utils.computeGreatCircleDistance(ppos, nextWaypoint.infos.coordinates)
                : leg.getDistanceToGo(ppos);

            this.distanceToEnd = distanceToGo + outboundLength + (this.distancesToEnd.get(activeLegIndex + 1) ?? 0);
        } else if (activeTransIndex === activeLegIndex) {
            // On an outbound transition
            // We subtract `outboundLength` because getDistanceToGo will include the entire distance while we only want the part that's on this leg.
            // For a FixedRadiusTransition, there's also a part on the next leg.
            this.distanceToEnd = outboundTransition.getDistanceToGo(ppos) - outboundLength + (this.distancesToEnd.get(activeLegIndex + 1) ?? 0);
        } else if (activeTransIndex === activeLegIndex - 1) {
            // On an inbound transition
            const trueTrack = SimVar.GetSimVarValue('GPS GROUND TRUE TRACK', 'degree');

            let transitionDistanceToGo = inboundTransition.getDistanceToGo(ppos);

            if (inboundTransition instanceof PathCaptureTransition) {
                transitionDistanceToGo = inboundTransition.getActualDistanceToGo(ppos, trueTrack);
            } else if (inboundTransition instanceof FixedRadiusTransition && inboundTransition.isReverted) {
                transitionDistanceToGo = inboundTransition.revertTo.getActualDistanceToGo(ppos, trueTrack);
            }

            this.distanceToEnd = transitionDistanceToGo + legDistance + outboundLength + (this.distancesToEnd.get(activeLegIndex + 1) ?? 0);
        } else {
            console.error(`[FMS/VNAV] Unexpected transition index (legIndex: ${activeLegIndex}, transIndex: ${activeTransIndex})`);
        }
    }

    private hasValidSpeedConstraint(leg: Leg): boolean {
        return leg.metadata.speedConstraint?.speed > 100 && leg.metadata.speedConstraint.type !== SpeedConstraintType.atOrAbove;
    }

    private hasValidClimbAltitudeConstraint(leg: Leg): boolean {
        return leg.metadata.altitudeConstraint && leg.metadata.altitudeConstraint.type !== AltitudeConstraintType.atOrAbove
            && (this.climbAlitudeConstraints.length < 1 || leg.metadata.altitudeConstraint.altitude1 >= this.climbAlitudeConstraints[this.climbAlitudeConstraints.length - 1].maxAltitude);
    }

    private hasValidClimbSpeedConstraint(leg: Leg): boolean {
        return this.hasValidSpeedConstraint(leg)
            && (this.climbSpeedConstraints.length < 1 || leg.metadata.speedConstraint.speed >= this.climbSpeedConstraints[this.climbSpeedConstraints.length - 1].maxSpeed);
    }

    private hasValidDescentAltitudeConstraint(leg: Leg): boolean {
        return !!leg.metadata.altitudeConstraint;
    }

    private hasValidDescentSpeedConstraint(leg: Leg): boolean {
        return this.hasValidSpeedConstraint(leg);
    }

    private hasValidPathAngleConstraint(leg: Leg) {
        // We don't use strict equality because we want to check for null and undefined but not 0, which is falsy in JS
        return leg.metadata.pathAngleConstraint != null;
    }

    resetAltitudeConstraints() {
        this.climbAlitudeConstraints = [];
        this.descentAltitudeConstraints = [];
    }

    resetSpeedConstraints() {
        this.climbSpeedConstraints = [];
        this.descentSpeedConstraints = [];
    }

    resetPathAngleConstraints() {
        this.flightPathAngleConstraints = [];
    }

    reset() {
        this.resetAltitudeConstraints();
        this.resetSpeedConstraints();
        this.resetPathAngleConstraints();

        this.totalFlightPlanDistance = 0;
        this.distanceToPresentPosition = 0;
        this.distancesToEnd.clear();
    }

    private updateDistanceFromStart(index: number, ppos: LatLongAlt) {
        const leg = this.guidanceController.activeGeometry.legs.get(index);
        const waypoint = this.guidanceController.flightPlanManager.getWaypoint(index, FlightPlans.Active);
        const nextWaypoint = this.guidanceController.flightPlanManager.getWaypoint(index + 1, FlightPlans.Active);

        if (!leg || leg.isNull) {
            return;
        }

        const transitions = this.guidanceController.activeGeometry.transitions;
        const inboundTransition = transitions.get(index - 1);
        const outboundTransition = transitions.get(index);

        const [inboundLength, legDistance, outboundLength] = Geometry.completeLegPathLengths(
            leg, (inboundTransition?.isNull || !inboundTransition?.isComputed) ? null : inboundTransition, outboundTransition,
        );

        const correctedInboundLength = Number.isNaN(inboundLength) ? 0 : inboundLength;
        const totalLegLength = legDistance + correctedInboundLength + outboundLength;

        this.totalFlightPlanDistance += totalLegLength;

        if (waypoint.endsInDiscontinuity) {
            const startingPointOfDisco = waypoint.discontinuityCanBeCleared
                ? waypoint
                : this.guidanceController.flightPlanManager.getWaypoint(index - 1, FlightPlans.Active); // MANUAL

            this.totalFlightPlanDistance += Avionics.Utils.computeGreatCircleDistance(startingPointOfDisco.infos.coordinates, nextWaypoint.infos.coordinates);
        }

        const activeLegIndex = this.guidanceController.activeLegIndex;
        const activeTransIndex = this.guidanceController.activeTransIndex;

        if (index < activeLegIndex) {
            this.distanceToPresentPosition += totalLegLength;
        } else if (index === activeLegIndex) {
            if (activeTransIndex < 0) {
                const distanceToGo = leg instanceof VMLeg
                    ? Avionics.Utils.computeGreatCircleDistance(ppos, nextWaypoint.infos.coordinates)
                    : leg.getDistanceToGo(ppos);

                // On a leg, not on any guided transition
                this.distanceToPresentPosition += legDistance + correctedInboundLength - distanceToGo;
            } else if (activeTransIndex === activeLegIndex) {
                // On an outbound transition
                this.distanceToPresentPosition += legDistance + correctedInboundLength - outboundTransition.getDistanceToGo(ppos) - outboundLength;
            } else if (activeTransIndex === activeLegIndex - 1) {
                // On an inbound transition
                const trueTrack = SimVar.GetSimVarValue('GPS GROUND TRUE TRACK', 'degree');

                const transitionDistanceToGo = inboundTransition instanceof PathCaptureTransition
                    ? inboundTransition.getActualDistanceToGo(ppos, trueTrack)
                    : inboundTransition.getDistanceToGo(ppos);

                this.distanceToPresentPosition += correctedInboundLength - transitionDistanceToGo;
            } else {
                console.error(`[FMS/VNAV] Unexpected transition index (legIndex: ${activeLegIndex}, transIndex: ${this.guidanceController.activeTransIndex})`);
            }
        }
    }

    private updateDistancesToEnd(geometry: Geometry) {
        const { legs, transitions } = geometry;
        const fpm = this.guidanceController.flightPlanManager;

        let cumulativeDistance = 0;

        for (let i = fpm.getWaypointsCount(FlightPlans.Active) - 1; i >= fpm.getActiveWaypointIndex(); i--) {
            const leg = legs.get(i);
            const waypoint = fpm.getWaypoint(i, FlightPlans.Active);
            const nextWaypoint = fpm.getWaypoint(i + 1, FlightPlans.Active);

            if (!leg || leg.isNull) {
                return;
            }

            const inboundTransition = transitions.get(i - 1);
            const outboundTransition = transitions.get(i);

            const [inboundLength, legDistance, outboundLength] = Geometry.completeLegPathLengths(
                leg, (inboundTransition?.isNull || !inboundTransition?.isComputed) ? null : inboundTransition, outboundTransition,
            );

            const correctedInboundLength = Number.isNaN(inboundLength) ? 0 : inboundLength;
            const totalLegLength = legDistance + correctedInboundLength + outboundLength;

            cumulativeDistance += totalLegLength;

            if (waypoint.endsInDiscontinuity) {
                const startingPointOfDisco = waypoint.discontinuityCanBeCleared
                    ? waypoint
                    : fpm.getWaypoint(i - 1, FlightPlans.Active); // MANUAL

                cumulativeDistance += Avionics.Utils.computeGreatCircleDistance(startingPointOfDisco.infos.coordinates, nextWaypoint.infos.coordinates);
            }

            this.distancesToEnd.set(i, cumulativeDistance);
        }
    }
}
