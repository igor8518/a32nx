const MAX_FIX_ROW = 5;

const Markers = {
    FPLN_DISCONTINUITY: ["---F-PLN DISCONTINUITY--"],
    END_OF_FPLN:        ["------END OF F-PLN------"],
    NO_ALTN_FPLN:       ["-----NO ALTN F-PLN------"],
    END_OF_ALTN_FPLN:   ["---END OF ALT F-PLN----"],
    TOO_STEEP_PATH:     ["-----TOO STEEP PATH-----"]
};

class CDUFlightPlanPage {

    static ShowPage(mcdu, offset = 0) {

        // INIT
        function addLskAt(index, delay, callback) {
            mcdu.leftInputDelay[index] = (typeof delay === 'function') ? delay : () => delay;
            mcdu.onLeftInput[index] = callback;
        }

        function addRskAt(index, delay, callback) {
            mcdu.rightInputDelay[index] = (typeof delay === 'function') ? delay : () => delay;
            mcdu.onRightInput[index] = callback;
        }

        function getRunwayInfo(runway) {
            let runwayText, runwayAlt;
            if (runway) {
                runwayText = Avionics.Utils.formatRunway(runway.designation);
                runwayAlt = (runway.elevation * 3.280).toFixed(0).toString();
            }
            return [runwayText, runwayAlt];
        }

        function formatAltitudeOrLevel(altitudeToFormat) {
            if (mcdu.flightPlanManager.getOriginTransitionAltitude() >= 100 && altitudeToFormat > mcdu.flightPlanManager.getOriginTransitionAltitude()) {
                return `FL${(altitudeToFormat / 100).toFixed(0).toString().padStart(3,"0")}`;
            }

            return (10 * Math.round(altitudeToFormat / 10)).toFixed(0).toString().padStart(5,"\xa0");
        }

        //mcdu.flightPlanManager.updateWaypointDistances(false /* approach */);
        //mcdu.flightPlanManager.updateWaypointDistances(true /* approach */);
        mcdu.clearDisplay();
        mcdu.page.Current = mcdu.page.FlightPlanPage;
        mcdu.returnPageCallback = () => {
            CDUFlightPlanPage.ShowPage(mcdu, offset);
        };
        mcdu.activeSystem = 'FMGC';
        const fpm = mcdu.flightPlanManager;

        // regular update due to showing dynamic data on this page
        mcdu.page.SelfPtr = setTimeout(() => {
            if (mcdu.page.Current === mcdu.page.FlightPlanPage) {
                CDUFlightPlanPage.ShowPage(mcdu, offset);
            }
        }, mcdu.PageTimeout.Medium);

        const flightPhase = mcdu.flightPhaseManager.phase;
        const isFlying = flightPhase >= FmgcFlightPhases.TAKEOFF && flightPhase != FmgcFlightPhases.DONE;

        let showFrom = false;
        let showTMPY = false;
        // TODO FIXME: Correct FMS lateral position calculations and move logic from F-PLN A
        // 22-70-00:11
        const adirLat = ADIRS.getLatitude();
        const adirLong = ADIRS.getLongitude();
        const ppos = (adirLat.isNormalOperation() && adirLong.isNormalOperation()) ? {
            lat: ADIRS.getLatitude().value,
            long: ADIRS.getLongitude().value,
        } : {
            lat: NaN,
            long: NaN
        };
        const stats = fpm.getCurrentFlightPlan().computeWaypointStatistics(ppos);

        // TODO FIXME: Move from F-PLN A
        const utcTime = SimVar.GetGlobalVarValue("ZULU TIME", "seconds");
        if (fpm.getOrigin()) {
            if (!isFlying) {
                fpm._waypointReachedAt = utcTime;
            }
        }

        const waypointsAndMarkers = [];
        const activeFirst = Math.max(0, fpm.getActiveWaypointIndex() - 1);

        // If we're still on the ground, force the active leg to be the first one even if we're close enough that the
        // FPM is trying to advance to the next one.
        const first = (mcdu.flightPhaseManager.phase <= FmgcFlightPhases.TAKEOFF) ? 0 : activeFirst;

        // PWPs
        const fmsPseudoWaypoints = mcdu.guidanceController.currentPseudoWaypoints;
        const fmsGeometryProfile = mcdu.guidanceController.vnavDriver.currentNavGeometryProfile;

        let vnavPredictionsMapByWaypoint = null;
        if (fmsGeometryProfile && fmsGeometryProfile.isReadyToDisplay) {
            vnavPredictionsMapByWaypoint = fmsGeometryProfile.waypointPredictions;
        }

        let cumulativeDistance = 0;
        // Primary F-PLAN

        // In this loop, we insert pseudowaypoints between regular waypoints and compute the distances between the previous and next (pseudo-)waypoint.
        for (let i = first; i < fpm.getWaypointsCount(); i++) {
            const pseudoWaypointsOnLeg = fmsPseudoWaypoints.filter((it) => it.displayedOnMcdu && it.alongLegIndex === i);
            pseudoWaypointsOnLeg.sort((a, b) => a.flightPlanInfo.distanceFromLastFix - b.flightPlanInfo.distanceFromLastFix);

            for (const pwp of pseudoWaypointsOnLeg) {
                pwp.distanceInFP = pwp.distanceFromStart - cumulativeDistance;
                cumulativeDistance = pwp.distanceFromStart;
            }

            if (pseudoWaypointsOnLeg) {
                waypointsAndMarkers.push(...pseudoWaypointsOnLeg.map((pwp) => ({ pwp, fpIndex: i })));
            }

            const wp = fpm.getWaypoint(i);

            // We either use the VNAV distance (which takes transitions into account), or we use whatever has already been computed in wp.distanceInFP.
            if (vnavPredictionsMapByWaypoint && vnavPredictionsMapByWaypoint.get(i)) {
                wp.distanceFromLastLine = vnavPredictionsMapByWaypoint.get(i).distanceFromStart - cumulativeDistance;
                cumulativeDistance = vnavPredictionsMapByWaypoint.get(i).distanceFromStart;
            } else {
                wp.distanceFromLastLine = wp.distanceInFP;
                cumulativeDistance = wp.cumulativeDistanceInFP;
            }

            if (i >= fpm.getActiveWaypointIndex() && wp.additionalData.legType === 14 /* HM */) {
                waypointsAndMarkers.push({ holdResumeExit: wp, fpIndex: i });
            }

            waypointsAndMarkers.push({ wp, fpIndex: i});

            if (wp.endsInDiscontinuity) {
                waypointsAndMarkers.push({ marker: Markers.FPLN_DISCONTINUITY, fpIndex: i});
            }
            if (i === fpm.getDestinationIndex()) {
                waypointsAndMarkers.push({ marker: Markers.END_OF_FPLN, fpIndex: i});
                // TODO: Rewrite once alt fpln exists
                waypointsAndMarkers.push({ marker: Markers.NO_ALTN_FPLN, fpIndex: i});
            }
        }
        // TODO: Alt F-PLAN

        // Render F-PLAN Display

        // fprow:   1      | 2     | 3 4   | 5 6   | 7 8   | 9 10  | 11 12   |
        // display: SPD/ALT| R0    | R1    | R2    | R3    | R4    | DEST    | SCRATCHPAD
        // functions:      | F[0]  | F[1]  | F[2]  | F[3]  | F[4]  | F[5]    |
        //                 | FROM  | TO    |
        let rowsCount = 5;

        if (waypointsAndMarkers.length === 0) {
            rowsCount = 0;
            mcdu.setTemplate([
                [`{left}{small}{sp}${showFrom ? "FROM" : "{sp}{sp}{sp}{sp}"}{end}{yellow}{sp}${showTMPY ? "TMPY" : ""}{end}{end}{right}{small}${SimVar.GetSimVarValue("ATC FLIGHT NUMBER", "string", "FMC")}{sp}{sp}{sp}{end}{end}`],
                ...emptyFplnPage()
            ]);
            mcdu.onLeftInput[0] = () => CDULateralRevisionPage.ShowPage(mcdu);
            return;
        } else if (waypointsAndMarkers.length >= 5) {
            rowsCount = 5;
        } else {
            rowsCount = waypointsAndMarkers.length;
        }

        // Only examine first 5 (or less) waypoints/markers
        const scrollWindow = [];
        for (let rowI = 0, winI = offset; rowI < rowsCount; rowI++, winI++) {
            winI = winI % (waypointsAndMarkers.length);

            const {wp, pwp, marker, holdResumeExit, fpIndex} = waypointsAndMarkers[winI];

            const wpPrev = fpm.getWaypoint(fpIndex - 1);
            const wpNext = fpm.getWaypoint(fpIndex + 1);
            const wpActive = (fpIndex >= fpm.getActiveWaypointIndex());

            // Bearing/Track
            let bearingTrack = "";
            const bearingTrackTo = wp ? wp : wpNext;
            if (wpPrev && bearingTrackTo && bearingTrackTo.additionalData.legType !== 14 /* HM */) {
                const magVar = Facilities.getMagVar(wpPrev.infos.coordinates.lat, wpPrev.infos.coordinates.long);
                switch (rowI) {
                    case 1:
                        if (fpm.getActiveWaypointIndex() === fpIndex) {
                            const br = fpm.getBearingToActiveWaypoint();
                            const bearing = A32NX_Util.trueToMagnetic(br, magVar);
                            bearingTrack = `BRG${bearing.toFixed(0).toString().padStart(3,"0")}\u00b0`;
                        }
                        break;
                    case 2:
                        const tr = Avionics.Utils.computeGreatCircleHeading(wpPrev.infos.coordinates, bearingTrackTo.infos.coordinates);
                        const track = A32NX_Util.trueToMagnetic(tr, magVar);
                        bearingTrack = `{${fpm.isCurrentFlightPlanTemporary() ? "yellow" : "green"}}TRK${track.toFixed(0).padStart(3,"0")}\u00b0{end}`;
                        break;
                }
            }

            if (wp) {
                // Waypoint
                if (offset === 0) {
                    showFrom = true;
                }

                let ident = wp.ident;
                const isOverfly = wp.additionalData && wp.additionalData.overfly;

                let verticalWaypoint = null;
                if (vnavPredictionsMapByWaypoint) {
                    verticalWaypoint = vnavPredictionsMapByWaypoint.get(fpIndex);
                }

                // Color
                let color = "green";
                if (fpm.isCurrentFlightPlanTemporary()) {
                    color = "yellow";
                } else if (fpIndex === fpm.getActiveWaypointIndex()) {
                    color = "white";
                }

                // Time
                let timeCell = "----[s-text]";
                let timeColor = "white";
                if (verticalWaypoint && isFinite(verticalWaypoint.secondsFromPresent)) {
                    const utcTime = SimVar.GetGlobalVarValue("ZULU TIME", "seconds");

                    timeCell = isFlying
                        ? `${FMCMainDisplay.secondsToUTC(utcTime + verticalWaypoint.secondsFromPresent)}[s-text]`
                        : `${FMCMainDisplay.secondsTohhmm(verticalWaypoint.secondsFromPresent)}[s-text]`;

                    timeColor = color;
                }

                // Fix Header
                let fixAnnotation = wp.additionalData.annotation;

                if (wp.additionalData) {
                    const magVar = Facilities.getMagVar(wp.infos.coordinates.lat, wp.infos.coordinates.long);
                    const magCourse = A32NX_Util.trueToMagnetic(wp.additionalData.course, magVar).toFixed(0).padStart(3, '0');
                    // ARINC Leg Types - R1A 610
                    switch (wp.additionalData.legType) {
                        case 1: // AF
                            fixAnnotation = `${Math.round(wp.additionalData.rho).toString().substring(0, 2).padStart(2, '0')} ${wp.additionalData.navaidIdent.substring(0, 3)}`;
                            break;
                        case 2: // CA
                        case 3: // CD
                        case 4: // CF
                        case 5: // CI
                        case 6: // CR
                        case 9: // FC
                        case 10: // FD
                            fixAnnotation = `C${magCourse}\u00b0`;
                            break;
                        case 8: // FA
                            fixAnnotation = `${wp.ident.substring(0, 3)}${magCourse}`;
                            break;
                        case 11: // FM
                            if (wpPrev) {
                                fixAnnotation = `${wpPrev.ident.substring(0,3)}${magCourse}`;
                            }
                            break;
                        case 12: // HA
                            ident = wp.legAltitude1.toFixed(0);
                            // fallthrough
                        case 13: // HF
                            fixAnnotation = `HOLD ${wp.turnDirection === 1 ? 'L' : 'R'}`;
                            break;
                        case 14: // HM
                            fixAnnotation = `C${magCourse}°`;
                            break;
                        case 16: // PI
                            fixAnnotation = `PROC ${wp.turnDirection === 1 ? 'L' : 'R'}`;
                            break;
                        case 17: // RF
                            fixAnnotation = `${("" + Math.round(wp.additionalData.radius)).padStart(2, "0")}\xa0ARC`;
                            break;
                        case 19: // VA
                        case 20: // VD
                        case 21: // VI
                        case 23: // VR
                            fixAnnotation = `H${magCourse}\u00b0`;
                            break;
                        case 22: // VM
                            fixAnnotation = `H${magCourse}`;
                            break;
                    }
                }

                // Distance
                let distance = "";

                // Active waypoint is live distance, others are distances in the flight plan
                // TODO FIXME: actually use the correct prediction
                if (fpIndex === fpm.getActiveWaypointIndex()) {
                    distance = stats.get(fpIndex).distanceFromPpos.toFixed(0);
                } else {
                    distance = wp.distanceFromLastLine.toFixed(0);
                }
                if (distance > 9999) {
                    distance = 9999;
                }
                distance = distance.toString();

                let altColor = color;
                let spdColor = color;
                let slashColor = color;

                let speedConstraint = "---";
                let speedPrefix = "";

                if (verticalWaypoint && verticalWaypoint.speed) {
                    speedConstraint = verticalWaypoint.speed < 1 ? formatMachNumber(verticalWaypoint.speed) : Math.round(verticalWaypoint.speed);

                    if (wp.speedConstraint > 10) {
                        speedPrefix = verticalWaypoint.isSpeedConstraintMet ? "{magenta}*{end}" : "{amber}*{end}";
                    }
                }

                speedConstraint = speedPrefix + speedConstraint;

                // Altitude
                const hasAltConstraint = wp.legAltitudeDescription > 0 && wp.legAltitudeDescription < 6;
                let altitudeConstraint = "-----";
                let altPrefix = "\xa0";
                if (fpIndex === fpm.getDestinationIndex()) {
                    // Only for destination waypoint, show runway elevation.
                    altColor = "white";
                    spdColor = "white";
                    const [rwTxt, rwAlt] = getRunwayInfo(fpm.getDestinationRunway());
                    if (rwTxt && rwAlt) {
                        altPrefix = "{magenta}*{end}";
                        ident += rwTxt;
                        altitudeConstraint = (Math.round((parseInt(rwAlt) + 50) / 10) * 10).toString();
                        altColor = color;
                    }
                    altitudeConstraint = altitudeConstraint.padStart(5,"\xa0");

                } else if (wp === fpm.getOrigin() && fpIndex === 0) {
                    const [rwTxt, rwAlt] = getRunwayInfo(fpm.getOriginRunway());
                    if (rwTxt && rwAlt) {
                        ident += rwTxt;
                        altitudeConstraint = rwAlt;
                        altColor = color;
                    }
                    altitudeConstraint = altitudeConstraint.padStart(5,"\xa0");
                } else {
                    let altitudeToFormat = wp.legAltitude1;

                    if (hasAltConstraint && ident !== "(DECEL)") {
                        if (verticalWaypoint && verticalWaypoint.altitude) {
                            altitudeToFormat = verticalWaypoint.altitude;
                        }

                        altitudeConstraint = formatAltitudeOrLevel(altitudeToFormat);

                        if (verticalWaypoint) {
                            altPrefix = verticalWaypoint.isAltitudeConstraintMet ? "{magenta}*{end}" : "{amber}*{end}";
                        } else {
                            altColor = "magenta";
                            slashColor = "magenta";
                        }
                    // Waypoint with no alt constraint.
                    // In this case `altitudeConstraint is actually just the predictedAltitude`
                    } else if (vnavPredictionsMapByWaypoint && !hasAltConstraint) {
                        if (verticalWaypoint && verticalWaypoint.altitude) {
                            altitudeConstraint = formatAltitudeOrLevel(verticalWaypoint.altitude);
                        } else {
                            altitudeConstraint = "-----";
                        }
                    }
                }

                if (speedConstraint === "---") {
                    spdColor = "white";
                }

                if (altitudeConstraint === "-----") {
                    altColor = "white";
                }

                if (fpIndex !== fpm.getDestinationIndex() && timeCell !== "----[s-text]") {
                    timeColor = color;
                } else {
                    timeColor = "white";
                }

                // forced turn indication if next leg is not a course reversal
                if (wpNext && legTurnIsForced(wpNext) && !legTypeIsCourseReversal(wpNext)) {
                    if (wpNext.turnDirection === 1) {
                        ident += "{";
                    } else {
                        ident += "}";
                    }
                }

                scrollWindow[rowI] = {
                    fpIndex: fpIndex,
                    active: wpActive,
                    ident,
                    color,
                    distance,
                    spdColor,
                    speedConstraint,
                    altColor,
                    altitudeConstraint: { alt: altitudeConstraint, altPrefix: altPrefix },
                    timeCell,
                    timeColor,
                    fixAnnotation: fixAnnotation ? fixAnnotation : "",
                    bearingTrack,
                    isOverfly,
                    slashColor
                };

                if (fpIndex !== fpm.getDestinationIndex()) {
                    addLskAt(rowI,
                        (value) => {
                            if (value === "") {
                                return mcdu.getDelaySwitchPage();
                            }
                            return mcdu.getDelayBasic();
                        },
                        (value, scratchpadCallback) => {
                            switch (value) {
                                case "":
                                    CDULateralRevisionPage.ShowPage(mcdu, wp, fpIndex);
                                    break;
                                case FMCMainDisplay.clrValue:
                                    CDUFlightPlanPage.clearWaypoint(mcdu, fpIndex, offset, scratchpadCallback);
                                    break;
                                case FMCMainDisplay.ovfyValue:
                                    if (wp.additionalData.overfly) {
                                        mcdu.removeWaypointOverfly(fpIndex, () => {
                                            CDUFlightPlanPage.ShowPage(mcdu, offset);
                                        }, !fpm.isCurrentFlightPlanTemporary());
                                    } else {
                                        mcdu.addWaypointOverfly(fpIndex, () => {
                                            CDUFlightPlanPage.ShowPage(mcdu, offset);
                                        }, !fpm.isCurrentFlightPlanTemporary());
                                    }
                                    break;
                                default:
                                    if (value.length > 0) {
                                        mcdu.insertWaypoint(value, fpIndex, (success) => {
                                            if (!success) {
                                                scratchpadCallback();
                                            }
                                            CDUFlightPlanPage.ShowPage(mcdu, offset);
                                        }, !fpm.isCurrentFlightPlanTemporary());
                                    }
                                    break;
                            }
                        });
                } else {
                    addLskAt(rowI, () => mcdu.getDelaySwitchPage(),
                        (value, scratchpadCallback) => {
                            if (value === "") {
                                CDULateralRevisionPage.ShowPage(mcdu, fpm.getDestination(), fpIndex);
                            } else if (value.length > 0) {
                                mcdu.insertWaypoint(value, fpIndex, (success) => {
                                    if (!success) {
                                        scratchpadCallback();
                                    }
                                    CDUFlightPlanPage.ShowPage(mcdu, offset);
                                }, true);
                            }
                        });
                }

                const flightPhaseIsBeyondDescent = mcdu.flightPhaseManager.phase >= FmgcFlightPhases.DESCENT;

                let isConsideredDescentWaypoint = flightPhaseIsBeyondDescent;
                if (verticalWaypoint) {
                    isConsideredDescentWaypoint = isConsideredDescentWaypoint || verticalWaypoint.distanceToTopOfDescent < 0;
                }

                addRskAt(rowI, () => mcdu.getDelaySwitchPage(),
                    (value, scratchpadCallback) => {
                        if (value === "") {
                            CDUVerticalRevisionPage.ShowPage(mcdu, wp, verticalWaypoint, isConsideredDescentWaypoint);
                        } else if (value === FMCMainDisplay.clrValue) {
                            mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
                        } else {
                            CDUVerticalRevisionPage.setConstraints(mcdu, wp, value, scratchpadCallback, offset);
                        }
                    });

            } else if (pwp) {
                const color = (fpm.isCurrentFlightPlanTemporary()) ? "yellow" : "green";

                let timeCell = "----[s-text]";
                if (pwp.flightPlanInfo && isFinite(pwp.flightPlanInfo.secondsFromPresent)) {
                    const utcTime = SimVar.GetGlobalVarValue("ZULU TIME", "seconds");

                    timeCell = isFlying
                        ? `${FMCMainDisplay.secondsToUTC(utcTime + pwp.flightPlanInfo.secondsFromPresent)}[s-text]`
                        : `${FMCMainDisplay.secondsTohhmm(pwp.flightPlanInfo.secondsFromPresent)}[s-text]`;
                }

                let speed = "---";
                if (pwp.flightPlanInfo) {
                    speed = pwp.flightPlanInfo.speed < 1 ? formatMachNumber(pwp.flightPlanInfo.speed) : Math.round(pwp.flightPlanInfo.speed).toFixed(0);
                }

                scrollWindow[rowI] = {
                    fpIndex: fpIndex,
                    active: false,
                    ident: pwp.mcduIdent || pwp.ident,
                    color: (fpm.isCurrentFlightPlanTemporary()) ? "yellow" : "green",
                    distance: pwp.distanceInFP ? Math.round(pwp.distanceInFP).toFixed(0) : "",
                    spdColor: pwp.flightPlanInfo ? "green" : "white",
                    speedConstraint: speed,
                    altColor: pwp.flightPlanInfo ? "green" : "white",
                    altitudeConstraint: { alt: pwp.flightPlanInfo ? formatAltitudeOrLevel(pwp.flightPlanInfo.altitude) : "-----", altPrefix: "\xa0" },
                    timeCell,
                    timeColor: color,
                    fixAnnotation: `{green}${pwp.mcduHeader || ''}{end}`,
                    bearingTrack: "",
                    isOverfly: false,
                    slashColor: "green"
                };

                addLskAt(rowI, 0, (value, scratchpadCallback) => {
                    if (value === FMCMainDisplay.clrValue) {
                        // TODO
                        mcdu.addNewMessage(NXSystemMessages.notAllowed);
                    }
                });
            } else if (marker) {

                // Marker
                scrollWindow[rowI] = waypointsAndMarkers[winI];
                addLskAt(rowI, 0, (value, scratchpadCallback) => {
                    if (value === FMCMainDisplay.clrValue) {
                        mcdu.clearDiscontinuity(fpIndex, () => {
                            CDUFlightPlanPage.ShowPage(mcdu, offset);
                        }, !fpm.isCurrentFlightPlanTemporary());
                        return;
                    }

                    mcdu.insertWaypoint(value, fpIndex + 1, (success) => {
                        if (!success) {
                            scratchpadCallback();
                        }
                        CDUFlightPlanPage.ShowPage(mcdu, offset);
                    }, !fpm.isCurrentFlightPlanTemporary());
                });
            } else if (holdResumeExit) {
                const isActive = fpIndex === fpm.getActiveWaypointIndex();
                const isNext = fpIndex === (fpm.getActiveWaypointIndex() + 1);
                let color = "green";
                if (fpm.isCurrentFlightPlanTemporary()) {
                    color = "yellow";
                } else if (isActive) {
                    color = "white";
                }

                const decelReached = isActive || isNext && mcdu.holdDecelReached;
                const holdSpeed = fpIndex === mcdu.holdIndex && mcdu.holdSpeedTarget > 0 ? mcdu.holdSpeedTarget.toFixed(0) : '---';
                const turnDirection = holdResumeExit.turnDirection === 1 ? 'L' : 'R';
                // prompt should only be shown once entering decel for hold (3 - 20 NM before hold)
                const immExit = decelReached && !holdResumeExit.additionalData.immExit;
                const resumeHold = decelReached && holdResumeExit.additionalData.immExit;

                scrollWindow[rowI] = {
                    fpIndex,
                    holdResumeExit,
                    color,
                    immExit,
                    resumeHold,
                    holdSpeed,
                    turnDirection,
                };

                addLskAt(rowI, 0, (value, scratchpadCallback) => {
                    if (value === FMCMainDisplay.clrValue) {
                        CDUFlightPlanPage.clearWaypoint(mcdu, fpIndex, offset, scratchpadCallback);
                        return;
                    }

                    CDUHoldAtPage.ShowPage(mcdu, fpIndex);
                    scratchpadCallback();
                });

                addRskAt(rowI, 0, (value, scratchpadCallback) => {
                    // IMM EXIT, only active once reaching decel
                    if (isActive) {
                        mcdu.fmgcMesssagesListener.triggerToAllSubscribers('A32NX_IMM_EXIT', fpIndex, immExit);
                        setTimeout(() => {
                            CDUFlightPlanPage.ShowPage(mcdu, offset);
                        }, 500);
                    } else if (decelReached) {
                        fpm.removeWaypoint(fpIndex, true, () => {
                            CDUFlightPlanPage.ShowPage(mcdu, offset);
                        });
                    }
                    scratchpadCallback();
                });
            }
        }

        // Pass current waypoint data to ND
        if (scrollWindow[1]) {
            mcdu.currentFlightPlanWaypointIndex = scrollWindow[1].fpIndex;
            SimVar.SetSimVarValue("L:A32NX_SELECTED_WAYPOINT", "number", scrollWindow[1].fpIndex);
        } else if (scrollWindow[0]) {
            mcdu.currentFlightPlanWaypointIndex = scrollWindow[0].fpIndex;
            SimVar.SetSimVarValue("L:A32NX_SELECTED_WAYPOINT", "number", scrollWindow[0].fpIndex);
        } else {
            mcdu.currentFlightPlanWaypointIndex = first + offset;
            SimVar.SetSimVarValue("L:A32NX_SELECTED_WAYPOINT", "number", first + offset);
        }

        // Render scrolling data to text >> add ditto marks

        let firstWp = scrollWindow.length;
        const scrollText = [];
        for (let rowI = 0; rowI < scrollWindow.length; rowI++) {
            const { marker: cMarker, pwp: cPwp, holdResumeExit: cHold, speedConstraint: cSpd, altitudeConstraint: cAlt } = scrollWindow[rowI];
            let spdRpt = false;
            let altRpt = false;
            let showFix = true;
            let showDist = true;
            let showNm = false;

            if (cHold) {
                const { color, immExit, resumeHold, holdSpeed, turnDirection } = scrollWindow[rowI];
                scrollText[(rowI * 2)] = ['', `{amber}${immExit ? 'IMM\xa0\xa0' : ''}${resumeHold ? 'RESUME\xa0' : ''}{end}`, 'HOLD\xa0\xa0\xa0\xa0\xa0'];
                scrollText[(rowI * 2) + 1] = [`{${color}}HOLD ${turnDirection}{end}`, `{amber}${immExit ? 'EXIT*' : ''}${resumeHold ? 'HOLD*' : ''}{end}`, `{${color}}{small}{white}SPD{end}\xa0${holdSpeed}{end}{end}`];
            } else if (!cMarker && !cPwp) { // Waypoint
                if (rowI > 0) {
                    const { marker: pMarker, pwp: pPwp, holdResumeExit: pHold, speedConstraint: pSpd, altitudeConstraint: pAlt} = scrollWindow[rowI - 1];
                    if (!pMarker && !pPwp && !pHold) {
                        firstWp = Math.min(firstWp, rowI);
                        if (rowI === firstWp) {
                            showNm = true;
                        }
                        if (cSpd !== "---" && cSpd === pSpd) {
                            spdRpt = true;
                        }

                        if (cAlt.alt !== "-----" &&
                            cAlt.alt === pAlt.alt &&
                            cAlt.altPrefix === pAlt.altPrefix) {
                            altRpt = true;
                        }
                    // If previous row is a marker, clear all headers
                    } else if (!pHold) {
                        showDist = false;
                        showFix = false;
                    }
                }

                scrollText[(rowI * 2)] = renderFixHeader(scrollWindow[rowI], showNm, showDist, showFix);
                scrollText[(rowI * 2) + 1] = renderFixContent(scrollWindow[rowI], spdRpt, altRpt);

            // Marker
            } else {
                scrollText[(rowI * 2)] = [];
                scrollText[(rowI * 2) + 1] = cMarker;
            }
        }

        // Destination (R6)

        const destText = [];
        if (fpm.isCurrentFlightPlanTemporary()) {
            destText[0] = [" ", " "];
            destText[1] = ["{ERASE[color]amber", "INSERT*[color]amber"];

            showTMPY = true;

            addLskAt(5, 0, async () => {
                mcdu.eraseTemporaryFlightPlan(() => {
                    CDUFlightPlanPage.ShowPage(mcdu, 0);
                });
            });
            addRskAt(5, 0, async () => {
                mcdu.insertTemporaryFlightPlan(() => {
                    CDUFlightPlanPage.ShowPage(mcdu, 0);
                });
            });
        } else {
            let destCell = "----";
            let destinationRunway = null;
            if (fpm.getDestination()) {
                destCell = fpm.getDestination().ident;
                destinationRunway = fpm.getDestinationRunway();
                if (destinationRunway) {
                    destCell += Avionics.Utils.formatRunway(destinationRunway.designation);
                }
            }
            let destTimeCell = "----";
            let destDistCell = "---";
            let destEFOBCell = "---";

            if (fpm.getDestination() && fmsGeometryProfile) {
                const destStats = stats.get(fpm.getCurrentFlightPlan().waypoints.length - 1);
                if (destStats) {
                    destDistCell = destStats.distanceFromPpos.toFixed(0);

                    const destEfob = fmsGeometryProfile.getRemainingFuelAtDestination();
                    if (isFinite(destEfob)) {
                        destEFOBCell = (NXUnits.poundsToUser(destEfob) / 1000).toFixed(1);
                    }

                    const timeRemaining = fmsGeometryProfile.getTimeToDestination();
                    if (isFinite(timeRemaining)) {
                        const utcTime = SimVar.GetGlobalVarValue("ZULU TIME", "seconds");

                        destTimeCell = isFlying
                            ? FMCMainDisplay.secondsToUTC(utcTime + timeRemaining)
                            : FMCMainDisplay.secondsTohhmm(timeRemaining);
                    }
                }
            }

            destText[0] = ["\xa0DEST", "DIST EFOB", isFlying ? "\xa0UTC{sp}{sp}{sp}{sp}" : "TIME{sp}{sp}{sp}{sp}"];
            destText[1] = [destCell, `{small}${destDistCell}\xa0${destEFOBCell.padStart(4, '\xa0')}{end}`, `{small}${destTimeCell}{end}{sp}{sp}{sp}{sp}`];

            addLskAt(5, () => mcdu.getDelaySwitchPage(),
                () => {
                    CDULateralRevisionPage.ShowPage(mcdu, fpm.getDestination(), fpm.getWaypointsCount() - 1);
                });

            addRskAt(5, () => mcdu.getDelaySwitchPage(),
                () => {
                    CDUVerticalRevisionPage.ShowPage(mcdu, fpm.getDestination());
                });
        }

        // scrollText pad to 10 rows
        while (scrollText.length < 10) {
            scrollText.push([""]);
        }
        const allowScroll = waypointsAndMarkers.length > 4;
        if (allowScroll) {
            mcdu.onAirport = () => { // Only called if > 4 waypoints
                const isOnFlightPlanPage = mcdu.page.Current === mcdu.page.FlightPlanPage;
                const destinationAirportOffset = waypointsAndMarkers.length - 5;
                const allowCycleToOriginAirport = mcdu.flightPhaseManager.phase === FmgcFlightPhases.PREFLIGHT;
                if (offset === destinationAirportOffset && allowCycleToOriginAirport && isOnFlightPlanPage) { // only show origin if still on ground
                    // Go back to top of flight plan page to show origin airport.
                    offset = 0;
                } else {
                    offset = destinationAirportOffset; // if in air only dest is available.
                }
                CDUFlightPlanPage.ShowPage(mcdu, offset);
            };
            mcdu.onDown = () => { // on page down decrement the page offset.
                if (offset > 0) { // if page not on top
                    offset--;
                } else { // else go to the bottom
                    offset = waypointsAndMarkers.length - 1;
                }
                CDUFlightPlanPage.ShowPage(mcdu, offset);
            };
            mcdu.onUp = () => {
                if (offset < waypointsAndMarkers.length - 1) { // if page not on bottom
                    offset++;
                } else { // else go on top
                    offset = 0;
                }
                CDUFlightPlanPage.ShowPage(mcdu, offset);
            };
        }
        mcdu.setArrows(allowScroll, allowScroll, true, true);
        scrollText[0][1] = "SPD/ALT\xa0\xa0\xa0";
        scrollText[0][2] = isFlying ? "\xa0UTC{sp}{sp}{sp}{sp}" : "TIME{sp}{sp}{sp}{sp}";
        mcdu.setTemplate([
            [`{left}{small}{sp}${showFrom ? "FROM" : "{sp}{sp}{sp}{sp}"}{end}{yellow}{sp}${showTMPY ? "TMPY" : ""}{end}{end}{right}{small}${SimVar.GetSimVarValue("ATC FLIGHT NUMBER", "string", "FMC")}{sp}{sp}{sp}{end}{end}`],
            ...scrollText,
            ...destText
        ]);
    }

    static clearWaypoint(mcdu, fpIndex, offset, scratchpadCallback) {
        if (fpIndex <= mcdu.flightPlanManager.getActiveWaypointIndex()) {
            // 22-72-00:67
            // Stop clearing TO or FROM waypoints when NAV is engaged
            if (mcdu.navModeEngaged()) {
                mcdu.setScratchpadMessage(NXSystemMessages.notAllowedInNav);
                scratchpadCallback();
                return;
            }
        }
        // TODO if clear leg before a hold, delete hold too? some other legs like this too..
        mcdu.removeWaypoint(fpIndex, () => {
            CDUFlightPlanPage.ShowPage(mcdu, offset);
        }, !mcdu.flightPlanManager.isCurrentFlightPlanTemporary());
    }
}

function renderFixTableHeader(isFlying) {
    return [
        `{sp}\xa0FROM`,
        "SPD/ALT\xa0\xa0\xa0",
        isFlying ? "\xa0UTC{sp}{sp}{sp}{sp}" : "TIME{sp}{sp}{sp}{sp}"
    ];
}

function renderFixHeader(rowObj, showNm = false, showDist = true, showFix = true) {
    const { fixAnnotation, color, distance, bearingTrack } = rowObj;
    return [
        `${(showFix) ? fixAnnotation.padEnd(7, "\xa0").padStart(8, "\xa0") : ""}`,
        `${ showDist ? (showNm ? distance + "NM" : distance) : ''}${'\xa0'.repeat(showNm ? 3 : 5)}[color]${color}`,
        `{${color}}${bearingTrack}{end}\xa0`,
    ];
}

function renderFixContent(rowObj, spdRepeat = false, altRepeat = false) {
    const {ident, isOverfly, color, spdColor, speedConstraint, altColor, altitudeConstraint, timeCell, timeColor, slashColor} = rowObj;

    return [
        `${ident}${isOverfly ? FMCMainDisplay.ovfyValue : ""}[color]${color}`,
        `{${spdColor}}${spdRepeat ? "\xa0\"\xa0" : speedConstraint}{end}{${altColor}}{${slashColor}}/{end}${altRepeat ? "\xa0\xa0\xa0\"\xa0\xa0" : altitudeConstraint.altPrefix + altitudeConstraint.alt}{end}[s-text]`,
        `${timeCell}{sp}{sp}{sp}{sp}[color]${timeColor}`
    ];
}

function emptyFplnPage() {
    return [
        ["", "SPD/ALT", "TIME{sp}{sp}{sp}{sp}"],
        ["PPOS[color]green", "---/ -----", "----{sp}{sp}{sp}{sp}"],
        [""],
        ["---F-PLN DISCONTINUITY---"],
        [""],
        ["------END OF F-PLN-------"],
        [""],
        ["-----NO ALTN F-PLN-------"],
        [""],
        [""],
        ["\xa0DEST", "DIST EFOB", "TIME{sp}{sp}{sp}{sp}"],
        ["------", "---- ----", "----{sp}{sp}{sp}{sp}"]
    ];
}

function legTypeIsCourseReversal(wp) {
    switch (wp.additionalData.legType) {
        case 12: // HA
        case 13: // HF
        case 14: // HM
        case 16: // PI
            return true;
        default:
    }
    return false;
}

function legTurnIsForced(wp) {
    // left || right
    return wp.turnDirection === 1 || wp.turnDirection === 2;
}

function formatMachNumber(rawNumber) {
    return (Math.round(100 * rawNumber) / 100).toFixed(2).slice(1);
}
