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
import { ArmedLateralMode, LateralMode, VerticalMode } from '@shared/autopilot';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { McduSpeedProfile, ExpediteSpeedProfile, NdSpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { SelectedGeometryProfile } from '@fmgc/guidance/vnav/profile/SelectedGeometryProfile';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { StepCoordinator } from '@fmgc/guidance/vnav/StepCoordinator';
import { TakeoffPathBuilder } from '@fmgc/guidance/vnav/takeoff/TakeoffPathBuilder';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { Constants } from '@shared/Constants';
import { Geometry } from '../Geometry';
import { GuidanceComponent } from '../GuidanceComponent';
import { NavGeometryProfile } from './profile/NavGeometryProfile';
import { ClimbPathBuilder } from './climb/ClimbPathBuilder';

export class VnavDriver implements GuidanceComponent {
    version: number = 0;

    atmosphericConditions: AtmosphericConditions;

    takeoffPathBuilder: TakeoffPathBuilder;

    climbPathBuilder: ClimbPathBuilder;

    cruisePathBuilder: CruisePathBuilder;

    descentPathBuilder: DescentPathBuilder;

    decelPathBuilder: DecelPathBuilder;

    cruiseToDescentCoordinator: CruiseToDescentCoordinator;

    currentNavGeometryProfile: NavGeometryProfile;

    currentSelectedGeometryProfile?: SelectedGeometryProfile;

    currentNdGeometryProfile?: BaseGeometryProfile;

    currentDescentProfile: TheoreticalDescentPathCharacteristics

    currentApproachProfile: DecelPathCharacteristics;

    currentClimbSpeedProfile: McduSpeedProfile;

    timeMarkers = new Map<Seconds, PseudoWaypointFlightPlanInfo | undefined>([
        [10_000, undefined],
    ])

    stepCoordinator: StepCoordinator;

    constructor(
        private readonly guidanceController: GuidanceController,
        private readonly computationParametersObserver: VerticalProfileComputationParametersObserver,
        private readonly flightPlanManager: FlightPlanManager,
    ) {
        this.atmosphericConditions = new AtmosphericConditions();

        this.currentClimbSpeedProfile = new McduSpeedProfile(this.computationParametersObserver.get(), 0, []);

        this.takeoffPathBuilder = new TakeoffPathBuilder(computationParametersObserver, this.atmosphericConditions);
        this.climbPathBuilder = new ClimbPathBuilder(computationParametersObserver, this.atmosphericConditions);
        this.cruisePathBuilder = new CruisePathBuilder(computationParametersObserver);
        this.descentPathBuilder = new DescentPathBuilder(computationParametersObserver);
        this.decelPathBuilder = new DecelPathBuilder();
        this.cruiseToDescentCoordinator = new CruiseToDescentCoordinator(this.cruisePathBuilder, this.descentPathBuilder, this.decelPathBuilder);
        this.stepCoordinator = new StepCoordinator(this.flightPlanManager);
    }

    init(): void {
        console.log('[FMGC/Guidance] VnavDriver initialized!');
    }

    acceptMultipleLegGeometry(geometry: Geometry) {
        // Just put this here to avoid two billion updates per second in update()
        this.cruisePathBuilder.update();

        this.computeVerticalProfileForMcdu(geometry);
        this.computeVerticalProfileForNd(geometry);

        this.version++;
    }

    lastCruiseAltitude: Feet = 0;

    update(_: number): void {
        const newCruiseAltitude = SimVar.GetSimVarValue('L:AIRLINER_CRUISE_ALTITUDE', 'number');

        if (newCruiseAltitude !== this.lastCruiseAltitude) {
            this.lastCruiseAltitude = newCruiseAltitude;

            if (DEBUG) {
                console.log('[FMS/VNAV] Computed new vertical profile because of new cruise altitude.');
            }

            this.computeVerticalProfileForMcdu(this.guidanceController.activeGeometry);
            this.computeVerticalProfileForNd(this.guidanceController.activeGeometry);

            this.version++;
        }

        this.updateTimeMarkers();
        this.atmosphericConditions.update();
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

    private computeVerticalProfileForMcdu(geometry: Geometry) {
        console.time('VNAV computation');
        this.currentNavGeometryProfile = new NavGeometryProfile(geometry, this.flightPlanManager, this.guidanceController.activeLegIndex);

        this.currentClimbSpeedProfile = new McduSpeedProfile(
            this.computationParametersObserver.get(),
            this.currentNavGeometryProfile.distanceToPresentPosition,
            this.currentNavGeometryProfile.maxSpeedConstraints,
        );

        const { cruiseAltitude, fuelOnBoard, presentPosition } = this.computationParametersObserver.get();

        if (geometry.legs.size > 0 && this.computationParametersObserver.canComputeProfile()) {
            const isOnGround = SimVar.GetSimVarValue('SIM ON GROUND', 'Bool');
            if (isOnGround) {
                this.takeoffPathBuilder.buildTakeoffPath(this.currentNavGeometryProfile);
            } else {
                this.currentNavGeometryProfile.addPresentPositionCheckpoint(presentPosition, fuelOnBoard * Constants.TONS_TO_POUNDS);
            }

            this.climbPathBuilder.computeClimbPath(this.currentNavGeometryProfile, this.currentClimbSpeedProfile, cruiseAltitude);

            if (this.decelPathBuilder.canCompute(geometry, this.currentNavGeometryProfile.waypointCount)) {
                this.cruiseToDescentCoordinator.coordinate(this.currentNavGeometryProfile, this.currentClimbSpeedProfile);
            }

            this.currentNavGeometryProfile.finalizeProfile();

            if (VnavConfig.DEBUG_PROFILE) {
                console.log('this.currentNavGeometryProfile:', this.currentNavGeometryProfile);
            }

            this.guidanceController.pseudoWaypoints.acceptVerticalProfile();
        } else if (DEBUG) {
            console.warn('[FMS/VNAV] Did not compute vertical profile. Reason: no legs in flight plan.');
        }

        if (VnavConfig.DEBUG_PROFILE) {
            this.currentClimbSpeedProfile.showDebugStats();
        }

        console.timeEnd('VNAV computation');
    }

    private computeVerticalProfileForNd(geometry: Geometry) {
        const { fcuAltitude, presentPosition, fuelOnBoard } = this.computationParametersObserver.get();

        this.currentNdGeometryProfile = this.isInManagedNav()
            ? new NavGeometryProfile(geometry, this.flightPlanManager, this.guidanceController.activeLegIndex)
            : new SelectedGeometryProfile();

        const isOnGround = SimVar.GetSimVarValue('SIM ON GROUND', 'Bool');
        if (isOnGround) {
            this.takeoffPathBuilder.buildTakeoffPath(this.currentNdGeometryProfile);
        } else {
            this.currentNdGeometryProfile.addPresentPositionCheckpoint(presentPosition, fuelOnBoard * Constants.TONS_TO_POUNDS);
        }

        if (!this.shouldObeyAltitudeConstraints()) {
            this.currentNdGeometryProfile.maxAltitudeConstraints = [];
        }

        if (geometry.legs.size <= 0 || !this.computationParametersObserver.canComputeProfile()) {
            return;
        }

        const speedProfile = this.shouldObeySpeedConstraints()
            ? this.currentClimbSpeedProfile
            : new NdSpeedProfile(this.computationParametersObserver.get(), this.currentNdGeometryProfile.distanceToPresentPosition, this.currentNdGeometryProfile.maxSpeedConstraints);

        this.climbPathBuilder.computeClimbPath(this.currentNdGeometryProfile, speedProfile, fcuAltitude);
        this.currentNdGeometryProfile.finalizeProfile();

        if (VnavConfig.DEBUG_PROFILE) {
            console.log('this.currentNdGeometryProfile:', this.currentNdGeometryProfile);
        }
    }

    private shouldObeySpeedConstraints(): boolean {
        const { fcuSpeed } = this.computationParametersObserver.get();

        // TODO: Take MACH into account
        return this.isInManagedNav() && fcuSpeed <= 0;
    }

    private shouldObeyAltitudeConstraints(): boolean {
        const { fcuArmedLateralMode, fcuVerticalMode } = this.computationParametersObserver.get();

        const isNavArmed = (fcuArmedLateralMode & ArmedLateralMode.NAV) === ArmedLateralMode.NAV;

        const verticalModesToApplyAltitudeConstraintsFor = [
            VerticalMode.CLB,
            VerticalMode.ALT_CPT,
            VerticalMode.ALT_CST_CPT,
            VerticalMode.ALT_CST,
        ];

        return isNavArmed || verticalModesToApplyAltitudeConstraintsFor.includes(fcuVerticalMode);
    }

    computeVerticalProfileForExpediteClimb(): SelectedGeometryProfile | undefined {
        const greenDotSpeed = Simplane.getGreenDotSpeed();
        if (!greenDotSpeed) {
            return undefined;
        }

        const selectedSpeedProfile = new ExpediteSpeedProfile(greenDotSpeed);

        const expediteGeometryProfile = new SelectedGeometryProfile();
        const { fcuAltitude, presentPosition, fuelOnBoard } = this.computationParametersObserver.get();

        this.currentNavGeometryProfile.addPresentPositionCheckpoint(presentPosition, fuelOnBoard * Constants.TONS_TO_POUNDS);
        this.climbPathBuilder.computeClimbPath(expediteGeometryProfile, selectedSpeedProfile, fcuAltitude);

        expediteGeometryProfile.finalizeProfile();

        if (VnavConfig.DEBUG_PROFILE) {
            console.log(expediteGeometryProfile);
        }

        return expediteGeometryProfile;
    }

    getCurrentSpeedConstraint(): Knots {
        if (this.shouldObeySpeedConstraints()) {
            return this.currentClimbSpeedProfile.getCurrentSpeedConstraint();
        }

        return Infinity;
    }

    isInManagedNav(): boolean {
        const { fcuLateralMode, fcuArmedLateralMode } = this.computationParametersObserver.get();

        return fcuLateralMode === LateralMode.NAV || (fcuArmedLateralMode & ArmedLateralMode.NAV) === 1;
    }
}
