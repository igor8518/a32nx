//  Copyright (c) 2021 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { DecelPathBuilder, DecelPathCharacteristics } from '@fmgc/guidance/vnav/descent/DecelPathBuilder';
import { DescentPathBuilder } from '@fmgc/guidance/vnav/descent/DescentPathBuilder';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { FlightPlanManager } from '@fmgc/flightplanning/FlightPlanManager';
import { PseudoWaypointFlightPlanInfo } from '@fmgc/guidance/PseudoWaypoint';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { CruisePathBuilder } from '@fmgc/guidance/vnav/cruise/CruisePathBuilder';
import { CruiseToDescentCoordinator } from '@fmgc/guidance/vnav/CruiseToDescentCoordinator';
import { ArmedLateralMode, ArmedVerticalMode, LateralMode, VerticalMode } from '@shared/autopilot';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { McduSpeedProfile, ExpediteSpeedProfile, NdSpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { SelectedGeometryProfile } from '@fmgc/guidance/vnav/profile/SelectedGeometryProfile';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { StepCoordinator } from '@fmgc/guidance/vnav/StepCoordinator';
import { TakeoffPathBuilder } from '@fmgc/guidance/vnav/takeoff/TakeoffPathBuilder';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { Constants } from '@shared/Constants';
import { ClimbThrustClimbStrategy, VerticalSpeedStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
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

    currentApproachProfile: DecelPathCharacteristics;

    currentMcduSpeedProfile: McduSpeedProfile;

    timeMarkers = new Map<Seconds, PseudoWaypointFlightPlanInfo | undefined>()

    stepCoordinator: StepCoordinator;

    constructor(
        private readonly guidanceController: GuidanceController,
        private readonly computationParametersObserver: VerticalProfileComputationParametersObserver,
        private readonly flightPlanManager: FlightPlanManager,
    ) {
        this.atmosphericConditions = new AtmosphericConditions();

        this.currentMcduSpeedProfile = new McduSpeedProfile(this.computationParametersObserver.get(), 0, [], []);

        this.takeoffPathBuilder = new TakeoffPathBuilder(computationParametersObserver, this.atmosphericConditions);
        this.climbPathBuilder = new ClimbPathBuilder(computationParametersObserver, this.atmosphericConditions);
        this.stepCoordinator = new StepCoordinator(this.flightPlanManager);
        this.cruisePathBuilder = new CruisePathBuilder(computationParametersObserver, this.atmosphericConditions, this.stepCoordinator);
        this.descentPathBuilder = new DescentPathBuilder(computationParametersObserver, this.atmosphericConditions);
        this.decelPathBuilder = new DecelPathBuilder();
        this.cruiseToDescentCoordinator = new CruiseToDescentCoordinator(this.cruisePathBuilder, this.descentPathBuilder, this.decelPathBuilder);
    }

    init(): void {
        console.log('[FMGC/Guidance] VnavDriver initialized!');
    }

    acceptMultipleLegGeometry(geometry: Geometry) {
        // Just put this here to avoid two billion updates per second in update()
        this.cruisePathBuilder.update();

        this.computeVerticalProfileForMcdu(geometry);
        this.computeVerticalProfileForNd(geometry);

        this.stepCoordinator.updateGeometryProfile(this.currentNavGeometryProfile);

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

            this.stepCoordinator.updateGeometryProfile(this.currentNavGeometryProfile);

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

        this.currentMcduSpeedProfile = new McduSpeedProfile(
            this.computationParametersObserver.get(),
            this.currentNavGeometryProfile.distanceToPresentPosition,
            this.currentNavGeometryProfile.maxClimbSpeedConstraints,
            this.currentNavGeometryProfile.descentSpeedConstraints,
        );

        const climbStrategy = new ClimbThrustClimbStrategy(this.computationParametersObserver, this.atmosphericConditions);
        const descentStrategy = new VerticalSpeedStrategy(this.computationParametersObserver, this.atmosphericConditions, -1000);

        const { cruiseAltitude, fuelOnBoard, presentPosition, flightPhase } = this.computationParametersObserver.get();

        if (geometry.legs.size > 0 && this.computationParametersObserver.canComputeProfile()) {
            const isOnGround = SimVar.GetSimVarValue('SIM ON GROUND', 'Bool');
            if (isOnGround) {
                this.takeoffPathBuilder.buildTakeoffPath(this.currentNavGeometryProfile);
            } else {
                this.currentNavGeometryProfile.addPresentPositionCheckpoint(presentPosition, fuelOnBoard * Constants.TONS_TO_POUNDS);
            }

            if (flightPhase < FlightPhase.FLIGHT_PHASE_CRUISE) {
                this.climbPathBuilder.computeClimbPath(this.currentNavGeometryProfile, climbStrategy, this.currentMcduSpeedProfile, cruiseAltitude);
            }

            if (flightPhase < FlightPhase.FLIGHT_PHASE_DESCENT) {
                if (this.decelPathBuilder.canCompute(geometry, this.currentNavGeometryProfile.waypointCount)) {
                    this.cruiseToDescentCoordinator.buildCruiseAndDescentPath(this.currentNavGeometryProfile, this.currentMcduSpeedProfile, climbStrategy, descentStrategy);
                }
            } else {
                this.cruiseToDescentCoordinator.buildDescentPathOnly(this.currentNavGeometryProfile, this.currentMcduSpeedProfile);
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
            this.currentMcduSpeedProfile.showDebugStats();
        }

        console.timeEnd('VNAV computation');
    }

    private computeVerticalProfileForNd(geometry: Geometry) {
        const { fcuAltitude, fcuVerticalMode, presentPosition, fuelOnBoard, fcuVerticalSpeed, flightPhase } = this.computationParametersObserver.get();

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
            this.currentNdGeometryProfile.descentAltitudeConstraints = [];
        }

        if (geometry.legs.size <= 0 || !this.computationParametersObserver.canComputeProfile()) {
            return;
        }

        const climbStrategy = fcuVerticalMode === VerticalMode.VS
            ? new VerticalSpeedStrategy(this.computationParametersObserver, this.atmosphericConditions, fcuVerticalSpeed)
            : new ClimbThrustClimbStrategy(this.computationParametersObserver, this.atmosphericConditions);

        const stepDescentStrategy = new VerticalSpeedStrategy(this.computationParametersObserver, this.atmosphericConditions, -1000);

        const speedProfile = this.shouldObeySpeedConstraints()
            ? this.currentMcduSpeedProfile
            : new NdSpeedProfile(
                this.computationParametersObserver.get(),
                this.currentNdGeometryProfile.distanceToPresentPosition,
                this.currentNdGeometryProfile.maxClimbSpeedConstraints,
                this.currentNdGeometryProfile.descentSpeedConstraints,
            );

        if (flightPhase < FlightPhase.FLIGHT_PHASE_CRUISE) {
            this.climbPathBuilder.computeClimbPath(this.currentNdGeometryProfile,
                climbStrategy, speedProfile, fcuAltitude);
        }

        // To please TypeScript, we explicitly check that currentNdGeometryProfile is a NavGeometryProfile even if this is guaranteed by the check before
        if (this.isInManagedNav() && this.currentNdGeometryProfile instanceof NavGeometryProfile && this.decelPathBuilder.canCompute(geometry, this.currentNavGeometryProfile.waypointCount)) {
            if (flightPhase < FlightPhase.FLIGHT_PHASE_DESCENT) {
                this.cruiseToDescentCoordinator.buildCruiseAndDescentPath(this.currentNdGeometryProfile, speedProfile, climbStrategy, stepDescentStrategy);
            } else {
                this.cruiseToDescentCoordinator.buildDescentPathOnly(this.currentNdGeometryProfile, this.currentMcduSpeedProfile);
            }
        }

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

    shouldObeyAltitudeConstraints(): boolean {
        const { fcuArmedLateralMode, fcuArmedVerticalMode, fcuVerticalMode } = this.computationParametersObserver.get();

        const isClbArmed = (fcuArmedVerticalMode & ArmedVerticalMode.CLB) === ArmedVerticalMode.CLB;
        const isNavArmed = (fcuArmedLateralMode & ArmedLateralMode.NAV) === ArmedLateralMode.NAV;

        const verticalModesToApplyAltitudeConstraintsFor = [
            VerticalMode.CLB,
            VerticalMode.ALT_CPT,
            VerticalMode.ALT_CST_CPT,
            VerticalMode.ALT_CST,
            VerticalMode.DES,
        ];

        return isClbArmed || isNavArmed || verticalModesToApplyAltitudeConstraintsFor.includes(fcuVerticalMode);
    }

    computeVerticalProfileForExpediteClimb(): SelectedGeometryProfile | undefined {
        const { fcuAltitude, presentPosition, fuelOnBoard } = this.computationParametersObserver.get();

        const greenDotSpeed = Simplane.getGreenDotSpeed();
        if (!greenDotSpeed) {
            return undefined;
        }

        const selectedSpeedProfile = new ExpediteSpeedProfile(greenDotSpeed);
        const expediteGeometryProfile = new SelectedGeometryProfile();
        const climbStrategy = new ClimbThrustClimbStrategy(this.computationParametersObserver, this.atmosphericConditions);

        expediteGeometryProfile.addPresentPositionCheckpoint(presentPosition, fuelOnBoard * Constants.TONS_TO_POUNDS);
        this.climbPathBuilder.computeClimbPath(expediteGeometryProfile, climbStrategy, selectedSpeedProfile, fcuAltitude);

        expediteGeometryProfile.finalizeProfile();

        if (VnavConfig.DEBUG_PROFILE) {
            console.log(expediteGeometryProfile);
        }

        return expediteGeometryProfile;
    }

    getCurrentSpeedConstraint(): Knots {
        if (this.shouldObeySpeedConstraints()) {
            return this.currentMcduSpeedProfile.getCurrentSpeedTarget();
        }

        return Infinity;
    }

    isInManagedNav(): boolean {
        const { fcuLateralMode, fcuArmedLateralMode } = this.computationParametersObserver.get();

        return fcuLateralMode === LateralMode.NAV || (fcuArmedLateralMode & ArmedLateralMode.NAV) === 1;
    }
}
