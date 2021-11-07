//  Copyright (c) 2021 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { TheoreticalDescentPathCharacteristics } from '@fmgc/guidance/vnav/descent/TheoreticalDescentPath';
import { DecelPathBuilder, DecelPathCharacteristics } from '@fmgc/guidance/vnav/descent/DecelPathBuilder';
import { DescentPathBuilder } from '@fmgc/guidance/vnav/descent/DescentPathBuilder';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { FlightPlanManager } from '@fmgc/flightplanning/FlightPlanManager';
import { PseudoWaypointFlightPlanInfo } from '@fmgc/guidance/PseudoWaypoint';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { CruisePathBuilder } from '@fmgc/guidance/vnav/cruise/CruisePathBuilder';
import { CruiseToDescentCoordinator } from '@fmgc/guidance/vnav/CruiseToDescentCoordinator';
import { ArmedLateralMode, LateralMode } from '@shared/autopilot';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { ClimbSpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { Geometry } from '../Geometry';
import { GuidanceComponent } from '../GuidanceComponent';
import { GeometryProfile } from './GeometryProfile';
import { ClimbPathBuilder } from './climb/ClimbPathBuilder';

export class VnavDriver implements GuidanceComponent {
    climbPathBuilder: ClimbPathBuilder;

    cruisePathBuilder: CruisePathBuilder;

    descentPathBuilder: DescentPathBuilder;

    decelPathBuilder: DecelPathBuilder;

    cruiseToDescentCoordinator: CruiseToDescentCoordinator;

    currentGeometryProfile: GeometryProfile;

    currentDescentProfile: TheoreticalDescentPathCharacteristics

    currentApproachProfile: DecelPathCharacteristics;

    climbSpeedProfile: ClimbSpeedProfile;

    timeMarkers = new Map<Seconds, PseudoWaypointFlightPlanInfo | undefined>([
        [10_000, undefined],
    ])

    constructor(
        private readonly guidanceController: GuidanceController,
        private readonly computationParametersObserver: VerticalProfileComputationParametersObserver,
        private readonly flightPlanManager: FlightPlanManager,
    ) {
        this.climbSpeedProfile = new ClimbSpeedProfile(this.computationParametersObserver);

        this.climbPathBuilder = new ClimbPathBuilder(computationParametersObserver, this.climbSpeedProfile);
        this.cruisePathBuilder = new CruisePathBuilder(computationParametersObserver);
        this.descentPathBuilder = new DescentPathBuilder();
        this.decelPathBuilder = new DecelPathBuilder();
        this.cruiseToDescentCoordinator = new CruiseToDescentCoordinator(this.cruisePathBuilder, this.descentPathBuilder, this.decelPathBuilder);
    }

    init(): void {
        console.log('[FMGC/Guidance] VnavDriver initialized!');
    }

    acceptMultipleLegGeometry(geometry: Geometry) {
        // Just put this here to avoid two billion updates per second in update()
        this.climbPathBuilder.update();
        this.cruisePathBuilder.update();

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
        if (!this.currentGeometryProfile.isReadyToDisplay) {
            return;
        }

        for (const [time] of this.timeMarkers.entries()) {
            const prediction = this.currentGeometryProfile.predictAtTime(time);

            this.timeMarkers.set(time, prediction);
        }
    }

    private computeVerticalProfile(geometry: Geometry) {
        console.time('VNAV computation');
        this.currentGeometryProfile = new GeometryProfile(geometry, this.flightPlanManager, this.guidanceController.activeLegIndex, this.isInManagedNav());
        this.climbSpeedProfile.updateMaxSpeedConstraints(this.currentGeometryProfile.maxSpeedConstraints);

        if (geometry.legs.size > 0 && this.computationParametersObserver.canComputeProfile()) {
            this.climbPathBuilder.computeClimbPath(this.currentGeometryProfile);

            this.cruiseToDescentCoordinator.coordinate(this.currentGeometryProfile);

            this.currentGeometryProfile.finalizeProfile();

            if (VnavConfig.DEBUG_PROFILE) {
                console.log(this.currentGeometryProfile);
            }

            this.guidanceController.pseudoWaypoints.acceptVerticalProfile();
        } else if (DEBUG) {
            console.warn('[FMS/VNAV] Did not compute vertical profile. Reason: no legs in flight plan.');
        }

        if (VnavConfig.DEBUG_PROFILE) {
            this.climbSpeedProfile.showDebugStats();
        }

        console.timeEnd('VNAV computation');
    }

    private isInManagedNav(): boolean {
        const { fcuLateralMode, fcuArmedLateralMode } = this.computationParametersObserver.get();

        return fcuLateralMode === LateralMode.NAV || (fcuArmedLateralMode & ArmedLateralMode.NAV) === 1;
    }
}
