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
import { SelectedGeometryProfile } from '@fmgc/guidance/vnav/profile/SelectedGeometryProfile';
import { Geometry } from '../Geometry';
import { GuidanceComponent } from '../GuidanceComponent';
import { NavGeometryProfile } from './profile/NavGeometryProfile';
import { ClimbPathBuilder } from './climb/ClimbPathBuilder';

export class VnavDriver implements GuidanceComponent {
    climbPathBuilder: ClimbPathBuilder;

    cruisePathBuilder: CruisePathBuilder;

    descentPathBuilder: DescentPathBuilder;

    decelPathBuilder: DecelPathBuilder;

    cruiseToDescentCoordinator: CruiseToDescentCoordinator;

    currentNavGeometryProfile: NavGeometryProfile;

    currentSelectedGeometryProfile?: SelectedGeometryProfile;

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

        this.computeVerticalProfileForNav(geometry);
        this.computeVerticalProfileForSelected();
    }

    lastCruiseAltitude: Feet = 0;

    update(_: number): void {
        const newCruiseAltitude = SimVar.GetSimVarValue('L:AIRLINER_CRUISE_ALTITUDE', 'number');

        if (newCruiseAltitude !== this.lastCruiseAltitude) {
            this.lastCruiseAltitude = newCruiseAltitude;

            if (DEBUG) {
                console.log('[FMS/VNAV] Computed new vertical profile because of new cruise altitude.');
            }

            this.computeVerticalProfileForNav(this.guidanceController.activeGeometry);
            this.computeVerticalProfileForSelected();
        }

        this.updateTimeMarkers();
    }

    private updateTimeMarkers() {
        if (!this.currentNavGeometryProfile.isReadyToDisplay) {
            return;
        }

        for (const [time] of this.timeMarkers.entries()) {
            const prediction = this.currentNavGeometryProfile.predictAtTime(time);

            this.timeMarkers.set(time, prediction);
        }
    }

    private computeVerticalProfileForNav(geometry: Geometry) {
        console.time('VNAV computation');
        this.currentNavGeometryProfile = new NavGeometryProfile(geometry, this.flightPlanManager, this.guidanceController.activeLegIndex);
        this.climbSpeedProfile.updateMaxSpeedConstraints(this.currentNavGeometryProfile.maxSpeedConstraints);

        if (geometry.legs.size > 0 && this.computationParametersObserver.canComputeProfile()) {
            this.climbPathBuilder.computeClimbPath(this.currentNavGeometryProfile);

            if (!this.decelPathBuilder.canCompute(geometry)) {
                this.cruiseToDescentCoordinator.coordinate(this.currentNavGeometryProfile);
            }

            this.currentNavGeometryProfile.finalizeProfile();

            if (VnavConfig.DEBUG_PROFILE) {
                console.log(this.currentNavGeometryProfile);
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

    private computeVerticalProfileForSelected() {
        if (this.isInManagedNav()) {
            return;
        }

        this.currentSelectedGeometryProfile = new SelectedGeometryProfile();

        this.climbPathBuilder.computeClimbPath(this.currentSelectedGeometryProfile);

        this.currentSelectedGeometryProfile.finalizeProfile();

        if (VnavConfig.DEBUG_PROFILE) {
            console.log(this.currentSelectedGeometryProfile);
        }
    }

    private isInManagedNav(): boolean {
        const { fcuLateralMode, fcuArmedLateralMode } = this.computationParametersObserver.get();

        return fcuLateralMode === LateralMode.NAV || (fcuArmedLateralMode & ArmedLateralMode.NAV) === 1;
    }
}
