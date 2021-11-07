//  Copyright (c) 2021 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { TheoreticalDescentPathCharacteristics } from '@fmgc/guidance/vnav/descent/TheoreticalDescentPath';
import { DecelPathBuilder, DecelPathCharacteristics } from '@fmgc/guidance/vnav/descent/DecelPathBuilder';
import { DescentPathBuilder } from '@fmgc/guidance/vnav/descent/DescentPathBuilder';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { FlightPlanManager } from '@fmgc/flightplanning/FlightPlanManager';
import { Geometry } from '../Geometry';
import { GuidanceComponent } from '../GuidanceComponent';
import { GeometryProfile, VerticalCheckpoint } from './GeometryProfile';
import { ClimbPathBuilder } from './climb/ClimbPathBuilder';
import { Fmgc } from '../GuidanceController';

export class VnavDriver implements GuidanceComponent {
    climbPathBuilder: ClimbPathBuilder;

    currentGeometryProfile: GeometryProfile;

    currentDescentProfile: TheoreticalDescentPathCharacteristics

    currentApproachProfile: DecelPathCharacteristics;

    constructor(
        private readonly guidanceController: GuidanceController,
        fmgc: Fmgc,
        flightPlanManager: FlightPlanManager,
    ) {
        this.climbPathBuilder = new ClimbPathBuilder(fmgc, flightPlanManager);
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
    }

    private computeVerticalProfile(geometry: Geometry) {
        const checkpoints: VerticalCheckpoint[] = [];
        this.currentGeometryProfile = new GeometryProfile(geometry, checkpoints);

        if (geometry.legs.size > 0) {
            this.climbPathBuilder.computeClimbPath(this.currentGeometryProfile);

            DecelPathBuilder.computeDecelPath(this.currentGeometryProfile);

            this.currentDescentProfile = DescentPathBuilder.computeDescentPath(this.currentGeometryProfile);

            console.log(this.currentGeometryProfile);

            this.guidanceController.pseudoWaypoints.acceptVerticalProfile();
        } else if (DEBUG) {
            console.warn('[FMS/VNAV] Did not compute vertical profile. Reason: no legs in flight plan.');
        }
    }
}
