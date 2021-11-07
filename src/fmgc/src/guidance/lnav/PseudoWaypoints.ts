import { GuidanceComponent } from '@fmgc/guidance/GuidanceComponent';
import { PseudoWaypoint, PseudoWaypointSequencingAction } from '@fmgc/guidance/PseudoWaypoint';
import { VnavConfig, VnavDescentMode } from '@fmgc/guidance/vnav/VnavConfig';
import { NdSymbolTypeFlags } from '@shared/NavigationDisplay';
import { Geometry } from '@fmgc/guidance/Geometry';
import { Coordinates } from '@fmgc/flightplanning/data/geo';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { LateralMode } from '@shared/autopilot';
import { FixedRadiusTransition } from '@fmgc/guidance/lnav/transitions/FixedRadiusTransition';
import { Leg } from '@fmgc/guidance/lnav/legs/Leg';
import { VerticalCheckpointReason } from '@fmgc/guidance/vnav/GeometryProfile';
import { TimeUtils } from '@fmgc/utils/TimeUtils';

const PWP_IDENT_CLIMB_CONSTRAINT_LEVEL_OFF = 'Level off for climb constraint';
const PWP_IDENT_CONTINUE_CLIMB = 'Continue climb';
const PWP_SPEED_CHANGE = 'Speed change';
const PWP_IDENT_TOC = '(T/C)';
const PWP_IDENT_SPD_LIM = '(LIM)';
const PWP_IDENT_TOD = '(T/D)';
const PWP_IDENT_DECEL = '(DECEL)';
const PWP_IDENT_FLAP1 = '(FLAP1)';
const PWP_IDENT_FLAP2 = '(FLAP2)';

export class PseudoWaypoints implements GuidanceComponent {
    pseudoWaypoints: PseudoWaypoint[] = [];

    constructor(private guidanceController: GuidanceController) { }

    acceptVerticalProfile() {
        if (DEBUG) {
            console.log('[FMS/PWP] Computed new pseudo waypoints because of new vertical profile.');
        }
        this.recompute();
    }

    acceptMultipleLegGeometry(_geometry: Geometry) {
        if (DEBUG) {
            console.log('[FMS/PWP] Computed new pseudo waypoints because of new lateral geometry.');
        }
        this.recompute();
    }

    private recompute() {
        const geometry = this.guidanceController.activeGeometry;
        const wptCount = this.guidanceController.flightPlanManager.getWaypointsCount();

        const heading = SimVar.GetSimVarValue('PLANE HEADING DEGREES MAGNETIC', 'degrees');
        let track = SimVar.GetSimVarValue('GPS GROUND MAGNETIC TRACK', 'degrees');
        const groundSpeed = SimVar.GetSimVarValue('GPS GROUND SPEED', 'Meters per second');
        const trueHeading = SimVar.GetSimVarValue('PLANE HEADING DEGREES TRUE', 'degrees');

        // Workaround for bug with gps ground track simvar
        if (groundSpeed < 40) {
            track = (0.025 * groundSpeed + 0.00005) * track + (1 - (0.025 * groundSpeed + 0.00005)) * heading;
        }

        if (!geometry || geometry.legs.size < 1) {
            this.pseudoWaypoints.length = 0;
            return;
        }

        const newPseudoWaypoints: PseudoWaypoint[] = [];
        const totalDistance = this.guidanceController.vnavDriver.currentGeometryProfile.totalFlightPlanDistance;

        const geometryProfile = this.guidanceController.vnavDriver.currentGeometryProfile;

        if (!geometryProfile.isReadyToDisplay) {
            return;
        }

        // Restriction Level Off
        const levelOffCheckpoint = geometryProfile.findVerticalCheckpoint(VerticalCheckpointReason.LevelOffForConstraint);
        const levelOff = PseudoWaypoints.pointFromEndOfPath(geometry, wptCount, totalDistance - levelOffCheckpoint?.distanceFromStart);

        if (levelOff) {
            const [efisSymbolLla, distanceFromLegTermination, alongLegIndex] = levelOff;

            newPseudoWaypoints.push({
                ident: PWP_IDENT_CLIMB_CONSTRAINT_LEVEL_OFF,
                alongLegIndex,
                distanceFromLegTermination,
                efisSymbolFlag: NdSymbolTypeFlags.PwpLevelOffForRestriction,
                efisSymbolLla,
                displayedOnMcdu: false,
                flightPlanInfo: {
                    ...levelOffCheckpoint,
                    distanceFromLastFix: PseudoWaypoints.computePseudoWaypointDistanceFromFix(geometry.legs.get(alongLegIndex), distanceFromLegTermination),
                },
            });
        }

        // Continue Climb
        const continueClimbCheckpoint = geometryProfile.findVerticalCheckpoint(VerticalCheckpointReason.ContinueClimb);
        const continueClimb = PseudoWaypoints.pointFromEndOfPath(geometry, wptCount, totalDistance - continueClimbCheckpoint?.distanceFromStart);

        if (continueClimb) {
            const [efisSymbolLla, distanceFromLegTermination, alongLegIndex] = continueClimb;

            newPseudoWaypoints.push({
                ident: PWP_IDENT_CONTINUE_CLIMB,
                alongLegIndex,
                distanceFromLegTermination,
                efisSymbolFlag: NdSymbolTypeFlags.PwpContinueClimb,
                efisSymbolLla,
                displayedOnMcdu: false,
                flightPlanInfo: {
                    ...continueClimbCheckpoint,
                    distanceFromLastFix: PseudoWaypoints.computePseudoWaypointDistanceFromFix(geometry.legs.get(alongLegIndex), distanceFromLegTermination),
                },
            });
        }

        // Speed Changes
        const firstSpeedChange = geometryProfile.findDistancesFromEndToSpeedChanges()[0];

        if (firstSpeedChange) {
            const speedChange = PseudoWaypoints.pointFromEndOfPath(geometry, wptCount, firstSpeedChange);

            if (speedChange) {
                const [efisSymbolLla, distanceFromLegTermination, alongLegIndex] = speedChange;

                newPseudoWaypoints.push({
                    ident: PWP_SPEED_CHANGE,
                    alongLegIndex,
                    distanceFromLegTermination,
                    efisSymbolFlag: NdSymbolTypeFlags.SpeedChange,
                    efisSymbolLla,
                    displayedOnMcdu: false,
                });
            }
        }

        // SPD LIM
        const speedLimitCheckpoint = geometryProfile.findVerticalCheckpoint(VerticalCheckpointReason?.CrossingSpeedLimit);
        const speedLimit = PseudoWaypoints.pointFromEndOfPath(geometry, wptCount, totalDistance - speedLimitCheckpoint?.distanceFromStart);

        if (speedLimit) {
            const [efisSymbolLla, distanceFromLegTermination, alongLegIndex] = speedLimit;

            newPseudoWaypoints.push({
                ident: PWP_IDENT_SPD_LIM,
                alongLegIndex,
                distanceFromLegTermination,
                efisSymbolFlag: NdSymbolTypeFlags.PwpSpeedLimit,
                efisSymbolLla,
                displayedOnMcdu: true,
                mcduHeader: '(SPD)',
                flightPlanInfo: {
                    ...speedLimitCheckpoint,
                    distanceFromLastFix: PseudoWaypoints.computePseudoWaypointDistanceFromFix(geometry.legs.get(alongLegIndex), distanceFromLegTermination),
                },
            });
        }

        // Top Of Climb
        const tocCheckpoint = geometryProfile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfClimb);

        if (geometryProfile.shouldDrawPwpAlongNavPath) {
            const toc = PseudoWaypoints.pointFromEndOfPath(geometry, wptCount, totalDistance - tocCheckpoint?.distanceFromStart);

            if (toc) {
                const [efisSymbolLla, distanceFromLegTermination, alongLegIndex] = toc;

                newPseudoWaypoints.push({
                    ident: PWP_IDENT_TOC,
                    alongLegIndex,
                    distanceFromLegTermination,
                    efisSymbolFlag: NdSymbolTypeFlags.PwpTopOfClimb,
                    efisSymbolLla,
                    displayedOnMcdu: true,
                    flightPlanInfo: {
                        ...tocCheckpoint,
                        distanceFromLastFix: PseudoWaypoints.computePseudoWaypointDistanceFromFix(geometry.legs.get(alongLegIndex), distanceFromLegTermination),
                    },
                });
            }
        } else {
            const { lat, long } = this.guidanceController.getPresentPosition();
            const diff = Avionics.Utils.diffAngle(heading, track);
            const toc = Avionics.Utils.bearingDistanceToCoordinates(trueHeading + diff, tocCheckpoint.distanceFromStart, lat, long);

            newPseudoWaypoints.push({
                ident: PWP_IDENT_TOC,
                alongLegIndex: Infinity,
                distanceFromLegTermination: 0,
                efisSymbolFlag: NdSymbolTypeFlags.PwpTopOfClimb,
                efisSymbolLla: toc,
                displayedOnMcdu: false,
                flightPlanInfo: undefined,
            });
        }

        // Time Markers
        for (const [time, prediction] of this.guidanceController.vnavDriver.timeMarkers.entries()) {
            if (prediction) {
                const position = PseudoWaypoints.pointFromEndOfPath(geometry, wptCount, totalDistance - prediction.distanceFromStart, `TIME ${time}`);

                if (position) {
                    const [efisSymbolLla, distanceFromLegTermination, alongLegIndex] = position;

                    const ident = TimeUtils.formatSeconds(time);

                    newPseudoWaypoints.push({
                        ident,
                        alongLegIndex,
                        distanceFromLegTermination,
                        efisSymbolFlag: NdSymbolTypeFlags.PwpTimeMarker,
                        efisSymbolLla,
                        displayedOnMcdu: true,
                        mcduIdent: `(${TimeUtils.formatSeconds(time, false)})`,
                        mcduHeader: '{white}{big}(UTC){end}{end}',
                        flightPlanInfo: {
                            ...prediction,
                            distanceFromLastFix: PseudoWaypoints.computePseudoWaypointDistanceFromFix(geometry.legs.get(alongLegIndex), distanceFromLegTermination),
                        },
                    });
                }
            }
        }

        // Top of descent
        const todCheckpoint = geometryProfile.findVerticalCheckpoint(VerticalCheckpointReason.TopOfDescent);
        const tod = PseudoWaypoints.pointFromEndOfPath(geometry, wptCount, totalDistance - todCheckpoint?.distanceFromStart, DEBUG && PWP_IDENT_TOD);

        if (tod) {
            const [efisSymbolLla, distanceFromLegTermination, alongLegIndex] = tod;

            newPseudoWaypoints.push({
                ident: PWP_IDENT_TOD,
                sequencingType: PseudoWaypointSequencingAction.TOD_REACHED,
                alongLegIndex,
                distanceFromLegTermination,
                efisSymbolFlag: NdSymbolTypeFlags.PwpTopOfDescent,
                efisSymbolLla,
                displayedOnMcdu: true,
                flightPlanInfo: {
                    ...todCheckpoint,
                    distanceFromLastFix: PseudoWaypoints.computePseudoWaypointDistanceFromFix(geometry.legs.get(alongLegIndex), distanceFromLegTermination),
                },
            });
        }

        // DECEL
        const decelCheckpoint = geometryProfile.findVerticalCheckpoint(VerticalCheckpointReason.Decel);
        const decel = PseudoWaypoints.pointFromEndOfPath(geometry, wptCount, totalDistance - decelCheckpoint?.distanceFromStart, DEBUG && PWP_IDENT_DECEL);

        if (decel) {
            const [efisSymbolLla, distanceFromLegTermination, alongLegIndex] = decel;

            newPseudoWaypoints.push({
                ident: PWP_IDENT_DECEL,
                sequencingType: PseudoWaypointSequencingAction.APPROACH_PHASE_AUTO_ENGAGE,
                alongLegIndex,
                distanceFromLegTermination,
                efisSymbolFlag: NdSymbolTypeFlags.PwpDecel,
                efisSymbolLla,
                displayedOnMcdu: true,
                flightPlanInfo: {
                    ...decelCheckpoint,
                    distanceFromLastFix: PseudoWaypoints.computePseudoWaypointDistanceFromFix(geometry.legs.get(alongLegIndex), distanceFromLegTermination),
                },
            });
        }

        // CDA
        if (VnavConfig.VNAV_DESCENT_MODE === VnavDescentMode.CDA && VnavConfig.VNAV_EMIT_CDA_FLAP_PWP) {
            // FLAP 1
            const flap1Checkpoint = geometryProfile.findVerticalCheckpoint(VerticalCheckpointReason.Flaps1);
            const flap1 = PseudoWaypoints.pointFromEndOfPath(geometry, wptCount, totalDistance - flap1Checkpoint?.distanceFromStart, DEBUG && PWP_IDENT_FLAP1);

            if (flap1) {
                const [efisSymbolLla, distanceFromLegTermination, alongLegIndex] = flap1;

                newPseudoWaypoints.push({
                    ident: PWP_IDENT_FLAP1,
                    alongLegIndex,
                    distanceFromLegTermination,
                    efisSymbolFlag: NdSymbolTypeFlags.PwpCdaFlap1,
                    efisSymbolLla,
                    displayedOnMcdu: true,
                    flightPlanInfo: {
                        ...flap1Checkpoint,
                        distanceFromLastFix: PseudoWaypoints.computePseudoWaypointDistanceFromFix(geometry.legs.get(alongLegIndex), distanceFromLegTermination),
                    },
                });
            }

            // FLAP 2
            const flap2Checkpoint = geometryProfile.findVerticalCheckpoint(VerticalCheckpointReason.Flaps2);
            const flap2 = PseudoWaypoints.pointFromEndOfPath(geometry, wptCount, totalDistance - flap2Checkpoint?.distanceFromStart, DEBUG && PWP_IDENT_FLAP2);

            if (flap2) {
                const [efisSymbolLla, distanceFromLegTermination, alongLegIndex] = flap2;

                newPseudoWaypoints.push({
                    ident: PWP_IDENT_FLAP2,
                    alongLegIndex,
                    distanceFromLegTermination,
                    efisSymbolFlag: NdSymbolTypeFlags.PwpCdaFlap2,
                    efisSymbolLla,
                    displayedOnMcdu: true,
                    flightPlanInfo: {
                        ...flap2Checkpoint,
                        distanceFromLastFix: PseudoWaypoints.computePseudoWaypointDistanceFromFix(geometry.legs.get(alongLegIndex), distanceFromLegTermination),
                    },
                });
            }
        }

        this.pseudoWaypoints = newPseudoWaypoints;
    }

    init() {
        console.log('[FMGC/Guidance] PseudoWaypoints initialized!');
    }

    update(_: number) {
        // Pass our pseudo waypoints to the GuidanceController
        this.guidanceController.currentPseudoWaypoints.length = 0;

        let idx = 0;
        for (const pseudoWaypoint of this.pseudoWaypoints) {
            const onPreviousLeg = pseudoWaypoint.alongLegIndex === this.guidanceController.activeLegIndex - 1;
            const onActiveLeg = pseudoWaypoint.alongLegIndex === this.guidanceController.activeLegIndex;
            const afterActiveLeg = pseudoWaypoint.alongLegIndex > this.guidanceController.activeLegIndex;

            // TODO we also consider the previous leg as active because we sequence Type I transitions at the same point
            // for both guidance and legs list. IRL, the display sequences after the guidance, which means the pseudo-waypoints
            // on the first half of the transition are considered on the active leg, whereas without this hack they are
            // on the previous leg by the time we try to re-add them to the list.

            // We only want to add the pseudo waypoint if it's after the active leg or it isn't yet passed
            if (
                afterActiveLeg
                || (onPreviousLeg && this.guidanceController.displayActiveLegCompleteLegPathDtg > pseudoWaypoint.distanceFromLegTermination)
                || (onActiveLeg && this.guidanceController.activeLegCompleteLegPathDtg > pseudoWaypoint.distanceFromLegTermination)
            ) {
                this.guidanceController.currentPseudoWaypoints[++idx] = pseudoWaypoint;
            }
        }
    }

    /**
     * Notifies the FMS that a pseudo waypoint must be sequenced.
     *
     * This is to be sued by {@link GuidanceController} only.
     *
     * @param pseudoWaypoint the {@link PseudoWaypoint} to sequence.
     */
    sequencePseudoWaypoint(pseudoWaypoint: PseudoWaypoint): void {
        if (true) {
            console.log(`[FMS/PseudoWaypoints] Pseudo-waypoint '${pseudoWaypoint.ident}' sequenced.`);
        }

        switch (pseudoWaypoint.sequencingType) {
        case PseudoWaypointSequencingAction.TOD_REACHED:
            // TODO EFIS message;
            break;
        case PseudoWaypointSequencingAction.APPROACH_PHASE_AUTO_ENGAGE:
            const apLateralMode = SimVar.GetSimVarValue('L:A32NX_FMA_LATERAL_MODE', 'Number');
            const agl = Simplane.getAltitudeAboveGround();

            if (agl < 9500 && (apLateralMode === LateralMode.NAV || apLateralMode === LateralMode.LOC_CPT || apLateralMode === LateralMode.LOC_TRACK)) {
                // Request APPROACH phase engagement for 5 seconds
                SimVar.SetSimVarValue('L:A32NX_FM_ENABLE_APPROACH_PHASE', 'Bool', true).then(() => [
                    setTimeout(() => {
                        SimVar.SetSimVarValue('L:A32NX_FM_ENABLE_APPROACH_PHASE', 'Bool', false);
                    }, 5_000),
                ]);
            }
            break;
        default:
        }
    }

    /**
     * Computes a the distance between the fix before the PWP and the PWP
     *
     * @param leg               the leg along which this pseudo waypoint is situated
     * @param distanceAlongLeg  the distance from the termination of the leg to this pseudo waypoint
     *
     * @private
     */
    private static computePseudoWaypointDistanceFromFix(leg: Leg, distanceAlongLeg: number): NauticalMiles {
        return leg.distance - distanceAlongLeg;
    }

    private static pointFromEndOfPath(
        path: Geometry,
        wptCount: number,
        distanceFromEnd: NauticalMiles,
        debugString?: string,
    ): [lla: Coordinates, distanceFromLegTermination: number, legIndex: number] | undefined {
        if (!distanceFromEnd || distanceFromEnd < 0) {
            if (VnavConfig.DEBUG_PROFILE) {
                console.warn('[FMS/PWP](pointFromEndOfPath) distanceFromEnd was negative or undefined');
            }

            return undefined;
        }

        let accumulator = 0;

        if (DEBUG) {
            console.log(`[FMS/PWP] Starting placement of PWP '${debugString}': dist: ${distanceFromEnd.toFixed(2)}nm`);
        }

        for (let i = wptCount - 1; i > 0; i--) {
            const leg = path.legs.get(i);

            if (!leg) {
                continue;
            }

            const inboundTrans = path.transitions.get(i - 1);
            const outboundTrans = path.transitions.get(i);

            const [inboundTransLength, legPartLength, outboundTransLength] = Geometry.completeLegPathLengths(
                leg,
                inboundTrans,
                (outboundTrans instanceof FixedRadiusTransition) ? outboundTrans : null,
            );

            const totalLegPathLength = inboundTransLength + legPartLength + outboundTransLength;
            accumulator += totalLegPathLength;

            if (DEBUG) {
                const inb = inboundTransLength.toFixed(2);
                const legd = legPartLength.toFixed(2);
                const outb = outboundTransLength.toFixed(2);
                const acc = accumulator.toFixed(2);

                console.log(`[FMS/PWP] Trying to place PWP '${debugString}' ${distanceFromEnd.toFixed(2)} along leg #${i}; inb: ${inb}, leg: ${legd}, outb: ${outb}, acc: ${acc}`);
            }

            if (accumulator > distanceFromEnd) {
                const distanceFromEndOfLeg = distanceFromEnd - (accumulator - totalLegPathLength);

                let lla;
                if (distanceFromEndOfLeg < outboundTransLength) {
                    // Point is in outbound transition segment
                    const distanceBeforeTerminator = (outboundTrans.distance / 2) + distanceFromEndOfLeg;

                    if (DEBUG) {
                        console.log(`[FMS/PWP] Placed PWP '${debugString}' on leg #${i} outbound segment (${distanceFromEndOfLeg.toFixed(2)}nm before end)`);
                    }

                    lla = outboundTrans.getPseudoWaypointLocation(distanceBeforeTerminator);
                } else if (distanceFromEndOfLeg >= outboundTransLength && distanceFromEndOfLeg < (outboundTransLength + legPartLength)) {
                    // Point is in leg segment
                    const distanceBeforeTerminator = distanceFromEndOfLeg - outboundTransLength;

                    if (DEBUG) {
                        console.log(`[FMS/PWP] Placed PWP '${debugString}' on leg #${i} leg segment (${distanceBeforeTerminator.toFixed(2)}nm before end)`);
                    }

                    lla = leg.getPseudoWaypointLocation(distanceBeforeTerminator);
                } else {
                    // Point is in inbound transition segment
                    const distanceBeforeTerminator = distanceFromEndOfLeg - outboundTransLength - legPartLength;

                    if (DEBUG) {
                        console.log(`[FMS/PWP] Placed PWP '${debugString}' on leg #${i} inbound segment (${distanceBeforeTerminator.toFixed(2)}nm before end)`);
                    }

                    lla = inboundTrans.getPseudoWaypointLocation(distanceBeforeTerminator);
                }

                if (lla) {
                    return [lla, distanceFromEndOfLeg, i];
                }

                return undefined;
            }
        }

        if (DEBUG) {
            console.error(`[FMS/PseudoWaypoints] ${distanceFromEnd.toFixed(2)}nm is larger than the total lateral path.`);
        }

        return undefined;
    }
}
