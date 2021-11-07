//  Copyright (c) 2021 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { DecelPathBuilder, DecelPathCharacteristics } from '@fmgc/guidance/vnav/descent/DecelPathBuilder';
import { DescentPathBuilder } from '@fmgc/guidance/vnav/descent/DescentPathBuilder';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { RequestedVerticalMode, TargetAltitude, TargetVerticalSpeed } from '@fmgc/guidance/ControlLaws';
import { AtmosphericConditions } from '@fmgc/guidance/vnav/AtmosphericConditions';
import { VerticalMode, ArmedLateralMode, ArmedVerticalMode, isArmed, LateralMode } from '@shared/autopilot';
import { FlightPlanManager } from '@fmgc/flightplanning/FlightPlanManager';
import { PseudoWaypointFlightPlanInfo } from '@fmgc/guidance/PseudoWaypoint';
import { VerticalProfileComputationParametersObserver } from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { CruisePathBuilder } from '@fmgc/guidance/vnav/cruise/CruisePathBuilder';
import { CruiseToDescentCoordinator } from '@fmgc/guidance/vnav/CruiseToDescentCoordinator';
import { VnavConfig } from '@fmgc/guidance/vnav/VnavConfig';
import { McduSpeedProfile, ExpediteSpeedProfile, NdSpeedProfile } from '@fmgc/guidance/vnav/climb/SpeedProfile';
import { SelectedGeometryProfile } from '@fmgc/guidance/vnav/profile/SelectedGeometryProfile';
import { BaseGeometryProfile } from '@fmgc/guidance/vnav/profile/BaseGeometryProfile';
import { StepCoordinator } from '@fmgc/guidance/vnav/StepCoordinator';
import { TakeoffPathBuilder } from '@fmgc/guidance/vnav/takeoff/TakeoffPathBuilder';
import { Constants } from '@shared/Constants';
import { ClimbThrustClimbStrategy, VerticalSpeedStrategy } from '@fmgc/guidance/vnav/climb/ClimbStrategy';
import { ConstraintReader } from '@fmgc/guidance/vnav/ConstraintReader';
import { FmgcFlightPhase } from '@shared/flightphase';
import { TacticalDescentPathBuilder } from '@fmgc/guidance/vnav/descent/TacticalDescentPathBuilder';
import { IdleDescentStrategy } from '@fmgc/guidance/vnav/descent/DescentStrategy';
import { DescentGuidance } from '@fmgc/guidance/vnav/descent/DescentGuidance';
import { ProfileInterceptCalculator } from '@fmgc/guidance/vnav/descent/ProfileInterceptCalculator';
import { ApproachPathBuilder } from '@fmgc/guidance/vnav/descent/ApproachPathBuilder';
import { Geometry } from '../Geometry';
import { GuidanceComponent } from '../GuidanceComponent';
import { NavGeometryProfile, VerticalCheckpointReason } from './profile/NavGeometryProfile';
import { ClimbPathBuilder } from './climb/ClimbPathBuilder';

export class VnavDriver implements GuidanceComponent {
    atmosphericConditions: AtmosphericConditions

    version: number = 0;

    takeoffPathBuilder: TakeoffPathBuilder;

    climbPathBuilder: ClimbPathBuilder;

    cruisePathBuilder: CruisePathBuilder;

    tacticalDescentPathBuilder: TacticalDescentPathBuilder;

    managedDescentPathBuilder: DescentPathBuilder;

    decelPathBuilder: DecelPathBuilder;

    approachPathBuilder: ApproachPathBuilder;

    cruiseToDescentCoordinator: CruiseToDescentCoordinator;

    currentNavGeometryProfile: NavGeometryProfile;

    currentSelectedGeometryProfile?: SelectedGeometryProfile;

    currentNdGeometryProfile?: BaseGeometryProfile;

    currentApproachProfile: DecelPathCharacteristics;

    private guidanceMode: RequestedVerticalMode;

    private targetVerticalSpeed: TargetVerticalSpeed;

    private targetAltitude: TargetAltitude;

    currentMcduSpeedProfile: McduSpeedProfile;

    timeMarkers = new Map<Seconds, PseudoWaypointFlightPlanInfo | undefined>()

    stepCoordinator: StepCoordinator;

    private constraintReader: ConstraintReader;

    private descentGuidance: DescentGuidance;

    constructor(
        private readonly guidanceController: GuidanceController,
        private readonly computationParametersObserver: VerticalProfileComputationParametersObserver,
        private readonly flightPlanManager: FlightPlanManager,
    ) {
        this.atmosphericConditions = new AtmosphericConditions(computationParametersObserver.get().tropoPause);

        this.currentMcduSpeedProfile = new McduSpeedProfile(this.computationParametersObserver.get(), 0, [], []);

        this.takeoffPathBuilder = new TakeoffPathBuilder(computationParametersObserver, this.atmosphericConditions);
        this.climbPathBuilder = new ClimbPathBuilder(computationParametersObserver, this.atmosphericConditions);
        this.stepCoordinator = new StepCoordinator(this.flightPlanManager);
        this.cruisePathBuilder = new CruisePathBuilder(computationParametersObserver, this.atmosphericConditions, this.stepCoordinator);
        this.tacticalDescentPathBuilder = new TacticalDescentPathBuilder(this.computationParametersObserver);
        this.managedDescentPathBuilder = new DescentPathBuilder(computationParametersObserver, this.atmosphericConditions);
        // TODO: Remove decelPathBuilder
        this.decelPathBuilder = new DecelPathBuilder(computationParametersObserver, this.atmosphericConditions);
        this.approachPathBuilder = new ApproachPathBuilder(computationParametersObserver, this.atmosphericConditions);
        this.cruiseToDescentCoordinator = new CruiseToDescentCoordinator(this.cruisePathBuilder, this.managedDescentPathBuilder, this.approachPathBuilder);

        this.constraintReader = new ConstraintReader(this.flightPlanManager);

        this.descentGuidance = new DescentGuidance(computationParametersObserver);
    }

    init(): void {
        console.log('[FMGC/Guidance] VnavDriver initialized!');
    }

    acceptMultipleLegGeometry(geometry: Geometry) {
        this.constraintReader.extract(geometry, this.guidanceController.activeLegIndex);

        this.cruisePathBuilder.update();

        this.computeVerticalProfileForMcdu(geometry);
        this.computeVerticalProfileForNd(geometry);

        this.stepCoordinator.updateGeometryProfile(this.currentNavGeometryProfile);
        this.descentGuidance.updateProfile(this.currentNavGeometryProfile);

        this.version++;
    }

    lastCruiseAltitude: Feet = 0;

    update(_: number): void {
        this.atmosphericConditions.update();

        const newCruiseAltitude = SimVar.GetSimVarValue('L:AIRLINER_CRUISE_ALTITUDE', 'number');

        if (newCruiseAltitude !== this.lastCruiseAltitude) {
            this.lastCruiseAltitude = newCruiseAltitude;

            if (DEBUG) {
                console.log('[FMS/VNAV] Computed new vertical profile because of new cruise altitude.');
            }

            this.constraintReader.extract(this.guidanceController.activeGeometry, this.guidanceController.activeLegIndex);

            this.computeVerticalProfileForMcdu(this.guidanceController.activeGeometry);
            this.computeVerticalProfileForNd(this.guidanceController.activeGeometry);

            this.stepCoordinator.updateGeometryProfile(this.currentNavGeometryProfile);
            this.descentGuidance.updateProfile(this.currentNavGeometryProfile);

            this.version++;
        }

        this.updateTimeMarkers();
        this.atmosphericConditions.update();
        this.descentGuidance.update();
    }

    private updateTimeMarkers() {
        if (!this.currentNavGeometryProfile.isReadyToDisplay) {
            return;
        }

        for (const [time] of this.timeMarkers.entries()) {
            const prediction = this.currentNavGeometryProfile.predictAtTime(time);

            this.timeMarkers.set(time, prediction);
        }

        this.updateGuidance();
    }

    /**
     * Based on the last checkpoint in the profile, we build a profile to the destination
     * @param geometry
     */
    private finishProfileInManagedModes(profile: BaseGeometryProfile, fromFlightPhase: FmgcFlightPhase) {
        const { cruiseAltitude } = this.computationParametersObserver.get();

        const managedClimbStrategy = new ClimbThrustClimbStrategy(this.computationParametersObserver, this.atmosphericConditions);
        const stepDescentStrategy = new VerticalSpeedStrategy(this.computationParametersObserver, this.atmosphericConditions, -1000);

        if (fromFlightPhase < FmgcFlightPhase.Climb) {
            this.takeoffPathBuilder.buildTakeoffPath(profile);
        }

        this.currentMcduSpeedProfile = new McduSpeedProfile(
            this.computationParametersObserver.get(),
            this.currentNavGeometryProfile.distanceToPresentPosition,
            this.currentNavGeometryProfile.maxClimbSpeedConstraints,
            [...this.currentNavGeometryProfile.descentSpeedConstraints, ...this.currentNavGeometryProfile.approachSpeedConstraints],
        );

        if (fromFlightPhase < FmgcFlightPhase.Cruise) {
            this.climbPathBuilder.computeClimbPath(profile, managedClimbStrategy, this.currentMcduSpeedProfile, cruiseAltitude);
        }

        if (profile instanceof NavGeometryProfile && this.cruiseToDescentCoordinator.canCompute(profile)) {
            this.cruiseToDescentCoordinator.buildCruiseAndDescentPath(profile, this.currentMcduSpeedProfile, managedClimbStrategy, stepDescentStrategy);
        }
    }

    private computeVerticalProfileForMcdu(geometry: Geometry) {
        const { flightPhase, presentPosition, fuelOnBoard } = this.computationParametersObserver.get();

        this.currentNavGeometryProfile = new NavGeometryProfile(geometry, this.constraintReader, this.flightPlanManager.getWaypointsCount());

        if (geometry.legs.size <= 0 || !this.computationParametersObserver.canComputeProfile() || !this.decelPathBuilder.canCompute(geometry, this.currentNavGeometryProfile.waypointCount)) {
            return;
        }

        console.time('VNAV computation');
        // TODO: This is where the return to trajectory would go:
        if (flightPhase >= FmgcFlightPhase.Climb) {
            this.currentNavGeometryProfile.addPresentPositionCheckpoint(
                presentPosition,
                fuelOnBoard * Constants.TONS_TO_POUNDS,
            );
        }

        this.finishProfileInManagedModes(this.currentNavGeometryProfile, Math.max(FmgcFlightPhase.Takeoff, flightPhase));

        this.currentNavGeometryProfile.finalizeProfile();

        this.guidanceController.pseudoWaypoints.acceptVerticalProfile();

        console.timeEnd('VNAV computation');

        if (VnavConfig.DEBUG_PROFILE) {
            console.log('this.currentNavGeometryProfile:', this.currentNavGeometryProfile);
            this.currentMcduSpeedProfile.showDebugStats();
        }
    }

    private computeVerticalProfileForNd(geometry: Geometry) {
        const { fcuAltitude, fcuVerticalMode, presentPosition, fuelOnBoard, fcuVerticalSpeed, flightPhase } = this.computationParametersObserver.get();

        this.currentNdGeometryProfile = this.isInManagedNav()
            ? new NavGeometryProfile(geometry, this.constraintReader, this.flightPlanManager.getWaypointsCount())
            : new SelectedGeometryProfile();

        if (!this.computationParametersObserver.canComputeProfile()) {
            return;
        }

        if (flightPhase >= FmgcFlightPhase.Climb) {
            this.currentNdGeometryProfile.addPresentPositionCheckpoint(
                presentPosition,
                fuelOnBoard * Constants.TONS_TO_POUNDS,
            );
        } else {
            this.takeoffPathBuilder.buildTakeoffPath(this.currentNdGeometryProfile);
        }

        if (!this.shouldObeyAltitudeConstraints()) {
            this.currentNdGeometryProfile.resetAltitudeConstraints();
        }

        const speedProfile = this.shouldObeySpeedConstraints()
            ? this.currentMcduSpeedProfile
            : new NdSpeedProfile(
                this.computationParametersObserver.get(),
                this.currentNdGeometryProfile.distanceToPresentPosition,
                this.currentNdGeometryProfile.maxClimbSpeedConstraints,
                this.currentNdGeometryProfile.descentSpeedConstraints,
            );

        const tacticalClimbModes = [
            VerticalMode.OP_CLB,
        ];

        const tacticalDescentModes = [
            VerticalMode.OP_DES,
        ];

        if (tacticalClimbModes.includes(fcuVerticalMode) || fcuVerticalMode === VerticalMode.VS && fcuVerticalSpeed > 0) {
            const climbStrategy = fcuVerticalMode === VerticalMode.VS
                ? new VerticalSpeedStrategy(this.computationParametersObserver, this.atmosphericConditions, fcuVerticalSpeed)
                : new ClimbThrustClimbStrategy(this.computationParametersObserver, this.atmosphericConditions);

            this.climbPathBuilder.computeClimbPath(this.currentNdGeometryProfile,
                climbStrategy, speedProfile, fcuAltitude);
        } else if (tacticalDescentModes.includes(fcuVerticalMode) || fcuVerticalMode === VerticalMode.VS && fcuVerticalSpeed < 0) {
            const descentStrategy = fcuVerticalMode === VerticalMode.VS
                ? new VerticalSpeedStrategy(this.computationParametersObserver, this.atmosphericConditions, fcuVerticalSpeed)
                : new IdleDescentStrategy(this.computationParametersObserver, this.atmosphericConditions);

            this.tacticalDescentPathBuilder.buildTacticalDescentPath(this.currentNdGeometryProfile, descentStrategy, speedProfile, fcuAltitude);

            if (this.isInManagedNav()) {
                const intercept = ProfileInterceptCalculator.calculateIntercept(
                    this.currentNdGeometryProfile.checkpoints,
                    this.currentNavGeometryProfile.checkpoints.filter(({ reason }) => reason !== VerticalCheckpointReason.PresentPosition),
                );

                if (intercept) {
                    this.currentNdGeometryProfile.addInterpolatedCheckpoint(intercept, { reason: VerticalCheckpointReason.InterceptDescentProfileSelected });
                }
            }
        }

        if (this.isInManagedNav() && this.currentNdGeometryProfile) {
            // Move PresentPosition checkpoint to where we are at the end of the tactical repositioning to trick the managed profile computing from there
            if (this.currentNdGeometryProfile.checkpoints.length > 1) {
                this.currentNdGeometryProfile.checkpoints = this.currentNdGeometryProfile.checkpoints.filter(({ reason }) => reason !== VerticalCheckpointReason.PresentPosition);
                this.currentNdGeometryProfile.addCheckpointFromLast((checkpoint) => ({ ...checkpoint, reason: VerticalCheckpointReason.PresentPosition }));
            }

            this.finishProfileInManagedModes(this.currentNdGeometryProfile, Math.max(FmgcFlightPhase.Climb, flightPhase));
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

        const verticalModesToApplyAltitudeConstraintsFor = [
            VerticalMode.CLB,
            VerticalMode.ALT,
            VerticalMode.ALT_CPT,
            VerticalMode.ALT_CST_CPT,
            VerticalMode.ALT_CST,
            VerticalMode.DES,
        ];

        return isArmed(fcuArmedVerticalMode, ArmedVerticalMode.CLB)
            || isArmed(fcuArmedLateralMode, ArmedLateralMode.NAV)
            || verticalModesToApplyAltitudeConstraintsFor.includes(fcuVerticalMode);
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

        return fcuLateralMode === LateralMode.NAV || isArmed(fcuArmedLateralMode, ArmedLateralMode.NAV);
    }

    private updateGuidance(): void {
        let newGuidanceMode = RequestedVerticalMode.None;
        let newVerticalSpeed = 0;
        let newAltitude = 0;

        if (this.guidanceController.isManualHoldActive()) {
            const fcuVerticalMode = SimVar.GetSimVarValue('L:A32NX_FMA_VERTICAL_MODE', 'Enum');
            if (fcuVerticalMode === VerticalMode.DES) {
                const holdSpeed = SimVar.GetSimVarValue('L:A32NX_FM_HOLD_SPEED', 'number');
                const atHoldSpeed = this.atmosphericConditions.currentAirspeed <= (holdSpeed + 5);
                if (atHoldSpeed) {
                    newGuidanceMode = RequestedVerticalMode.VsSpeed;
                    newVerticalSpeed = -1000;
                    newAltitude = 0;
                }
            }
        }

        if (this.guidanceController.isManualHoldActive() || this.guidanceController.isManualHoldNext()) {
            let holdSpeedCas = SimVar.GetSimVarValue('L:A32NX_FM_HOLD_SPEED', 'number');
            const holdDecelReached = SimVar.GetSimVarValue('L:A32NX_FM_HOLD_DECEL', 'bool');

            const speedControlManual = Simplane.getAutoPilotAirspeedSelected();
            const isMach = Simplane.getAutoPilotMachModeActive();
            if (speedControlManual && holdDecelReached) {
                if (isMach) {
                    const holdValue = Simplane.getAutoPilotMachHoldValue();
                    holdSpeedCas = this.atmosphericConditions.computeCasFromMach(this.atmosphericConditions.currentAltitude, holdValue);
                } else {
                    holdSpeedCas = Simplane.getAutoPilotAirspeedHoldValue();
                }
            }

            const holdSpeedTas = this.atmosphericConditions.computeTasFromCas(this.atmosphericConditions.currentAltitude, holdSpeedCas);

            this.guidanceController.setHoldSpeed(holdSpeedTas);
        }

        if (newGuidanceMode !== this.guidanceMode) {
            this.guidanceMode = newGuidanceMode;
            SimVar.SetSimVarValue('L:A32NX_FG_REQUESTED_VERTICAL_MODE', 'number', this.guidanceMode);
        }
        if (newVerticalSpeed !== this.targetVerticalSpeed) {
            this.targetVerticalSpeed = newVerticalSpeed;
            SimVar.SetSimVarValue('L:A32NX_FG_TARGET_VERTICAL_SPEED', 'number', this.targetVerticalSpeed);
        }
        if (newAltitude !== this.targetAltitude) {
            this.targetAltitude = newAltitude;
            SimVar.SetSimVarValue('L:A32NX_FG_TARGET_ALTITUDE', 'number', this.targetAltitude);
        }
    }
}
