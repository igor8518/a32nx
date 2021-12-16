//  Copyright (c) 2021 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { TheoreticalDescentPathCharacteristics } from '@fmgc/guidance/vnav/descent/TheoreticalDescentPath';
import { DecelPathBuilder, DecelPathCharacteristics } from '@fmgc/guidance/vnav/descent/DecelPathBuilder';
import { DescentPathBuilder } from '@fmgc/guidance/vnav/descent/DescentPathBuilder';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { FlightPlanManager } from '@fmgc/flightplanning/FlightPlanManager';
import { Geometry } from '../Geometry';
import { GuidanceComponent } from '../GuidanceComponent';
import { GeometryProfile, VerticalPseudoWaypointPrediction } from './GeometryProfile';
import { ClimbPathBuilder } from './climb/ClimbPathBuilder';
import { Fmgc } from '../GuidanceController';

export class VnavDriver implements GuidanceComponent {
    climbPathBuilder: ClimbPathBuilder;

    currentGeometryProfile: GeometryProfile;

    currentDescentProfile: TheoreticalDescentPathCharacteristics

    currentApproachProfile: DecelPathCharacteristics;

    timeMarkers: { [k: number]: VerticalPseudoWaypointPrediction | undefined } = {
        190: undefined,
        500: undefined,
        700: undefined,
    };

    constructor(
        private readonly guidanceController: GuidanceController,
        fmgc: Fmgc,
        private readonly flightPlanManager: FlightPlanManager,
    ) {
        this.climbPathBuilder = new ClimbPathBuilder(fmgc);
    }

    init(): void {
        console.log('[FMGC/Guidance] VnavDriver initialized!');
    }

    acceptMultipleLegGeometry(geometry: Geometry) {
        // Just put this here to avoid two billion updates per second in update()
        this.climbPathBuilder.update();

        this.computeVerticalProfile(geometry);
    }

    lastCruiseAltitude: Feet = 0;

    update(_: number): void {
        const newCruiseAltitude = SimVar.GetSimVarValue('L:AIRLINER_CRUISE_ALTITUDE', 'number');

        if (newCruiseAltitude !== this.lastCruiseAltitude) {
            this.lastCruiseAltitude = newCruiseAltitude;

            if (DEBUG) {
                console.log('[FMS/VNAV] Computed new vertical profile because of new cruise altitude.');
            }

            this.computeVerticalProfile(this.guidanceController.activeGeometry);
        }

        this.updateTimeMarkers();
    }

    private updateTimeMarkers() {
        for (const [time] of Object.entries(this.timeMarkers)) {
            const prediction = this.currentGeometryProfile.predictAtTime(parseInt(time)!);

            this.timeMarkers[time] = prediction;
        }
    }

    private computeVerticalProfile(geometry: Geometry) {
        this.currentGeometryProfile = new GeometryProfile(geometry, this.flightPlanManager, this.guidanceController.activeLegIndex);

        if (geometry.legs.size > 0) {
            this.climbPathBuilder.computeClimbPath(this.currentGeometryProfile);
            DecelPathBuilder.computeDecelPath(this.currentGeometryProfile);
            this.currentDescentProfile = DescentPathBuilder.computeDescentPath(this.currentGeometryProfile);

            this.currentGeometryProfile.finalizeProfile();

            console.log(this.currentGeometryProfile);

            this.guidanceController.pseudoWaypoints.acceptVerticalProfile();
        } else if (DEBUG) {
            console.warn('[FMS/VNAV] Did not compute vertical profile. Reason: no legs in flight plan.');
        }
    }
}
