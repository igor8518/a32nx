function translateAtsuMessageType(type) {
    switch (type) {
        case Atsu.AtsuMessageType.Freetext:
            return "FREETEXT";
        case Atsu.AtsuMessageType.METAR:
            return "METAR";
        case Atsu.AtsuMessageType.TAF:
            return "TAF";
        case Atsu.AtsuMessageType.ATIS:
            return "ATIS";
        default:
            return "UNKNOWN";
    }
}

function fetchTimeValue() {
    let timeValue = SimVar.GetGlobalVarValue("ZULU TIME", "seconds");
    if (timeValue) {
        const seconds = Number.parseInt(timeValue);
        const displayTime = Utils.SecondsToDisplayTime(seconds, true, true, false);
        timeValue = displayTime.toString();
        return timeValue.substring(0, 5);
    }
    return null;
}

/**
 *  Converts lbs to kg
 * @param {string | number} value
 */
const lbsToKg = (value) => {
    return (+value * 0.453592).toString();
};

/**
 * Fetch SimBrief OFP data and store on FMCMainDisplay object
 * @param {FMCMainDisplay} mcdu FMCMainDisplay
 * @param {() => void} updateView
 */
const getSimBriefOfp = (mcdu, updateView, callback = () => {}) => {
    const simBriefUserId = NXDataStore.get("CONFIG_SIMBRIEF_USERID", "");

    if (!simBriefUserId) {
        mcdu.addNewMessage(NXFictionalMessages.noSimBriefUser);
        throw new Error("No SimBrief pilot ID provided");
    }

    mcdu.simbrief["sendStatus"] = "REQUESTING";

    updateView();

    return SimBriefApi.getSimBriefOfp(simBriefUserId)
        .then(data => {
            mcdu.simbrief["units"] = data.params.units;
            mcdu.simbrief["route"] = data.general.route;
            mcdu.simbrief["cruiseAltitude"] = data.general.initial_altitude;
            mcdu.simbrief["originIcao"] = data.origin.icao_code;
            mcdu.simbrief["originRwy"] = data.origin.plan_rwy;
            mcdu.simbrief["originTransAlt"] = parseInt(data.origin.trans_alt, 10);
            mcdu.simbrief["originTransLevel"] = parseInt(data.origin.trans_level, 10);
            mcdu.simbrief["destinationIcao"] = data.destination.icao_code;
            mcdu.simbrief["destinationRwy"] = data.destination.plan_rwy;
            mcdu.simbrief["destinationTransAlt"] = parseInt(data.destination.trans_alt, 10);
            mcdu.simbrief["destinationTransLevel"] = parseInt(data.destination.trans_level, 10);
            mcdu.simbrief["blockFuel"] = mcdu.simbrief["units"] === 'kgs' ? data.fuel.plan_ramp : lbsToKg(data.fuel.plan_ramp);
            mcdu.simbrief["payload"] = mcdu.simbrief["units"] === 'kgs' ? data.weights.payload : lbsToKg(data.weights.payload);
            mcdu.simbrief["estZfw"] = mcdu.simbrief["units"] === 'kgs' ? data.weights.est_zfw : lbsToKg(data.weights.est_zfw);
            mcdu.simbrief["paxCount"] = data.weights.pax_count_actual;
            mcdu.simbrief["bagCount"] = data.weights.bag_count_actual;
            mcdu.simbrief["paxWeight"] = mcdu.simbrief["units"] === 'kgs' ? data.weights.pax_weight : lbsToKg(data.weights.pax_weight);
            mcdu.simbrief["bagWeight"] = mcdu.simbrief["units"] === 'kgs' ? data.weights.bag_weight : lbsToKg(data.weights.bag_weight);
            mcdu.simbrief["freight"] = mcdu.simbrief["units"] === 'kgs' ? data.weights.freight_added : lbsToKg(data.weights.freight_added);
            mcdu.simbrief["cargo"] = mcdu.simbrief["units"] === 'kgs' ? data.weights.cargo : lbsToKg(data.weights.cargo);
            mcdu.simbrief["costIndex"] = data.general.costindex;
            mcdu.simbrief["navlog"] = data.navlog.fix;
            mcdu.simbrief["callsign"] = data.atc.callsign;
            mcdu.simbrief["alternateIcao"] = data.alternate.icao_code;
            mcdu.simbrief["alternateTransAlt"] = parseInt(data.alternate.trans_alt, 10);
            mcdu.simbrief["alternateTransLevel"] = parseInt(data.alternate.trans_level, 10);
            mcdu.simbrief["avgTropopause"] = data.general.avg_tropopause;
            mcdu.simbrief["ete"] = data.times.est_time_enroute;
            mcdu.simbrief["blockTime"] = data.times.est_block;
            mcdu.simbrief["outTime"] = data.times.est_out;
            mcdu.simbrief["onTime"] = data.times.est_on;
            mcdu.simbrief["inTime"] = data.times.est_in;
            mcdu.simbrief["offTime"] = data.times.est_off;
            mcdu.simbrief["taxiFuel"] = mcdu.simbrief["units"] === 'kgs' ? data.fuel.taxi : lbsToKg(data.fuel.taxi);
            mcdu.simbrief["tripFuel"] = mcdu.simbrief["units"] === 'kgs' ? data.fuel.enroute_burn : lbsToKg(data.fuel.enroute_burn);
            mcdu.simbrief["sendStatus"] = "DONE";

            callback();

            updateView();

            return mcdu.simbrief;
        })
        .catch(_err => {
            console.log(_err.message);

            mcdu.simbrief["sendStatus"] = "READY";
            updateView();
        });
};

/**
 * There are two uplink requests that are made at the same time:
 * - AOC ACT F-PLN
 * - PERF DATA
 */
const insertUplink = (mcdu) => {
    const {
        originIcao,
        originTransAlt,
        destinationIcao,
        destinationTransLevel,
        cruiseAltitude,
        costIndex,
        alternateIcao,
        avgTropopause,
        callsign
    } = mcdu.simbrief;

    const fromTo = `${originIcao}/${destinationIcao}`;

    mcdu.addNewMessage(NXSystemMessages.uplinkInsertInProg);

    /**
     * AOC ACT F-PLN UPLINK
     */
    mcdu.tryUpdateFromTo(fromTo, async (result) => {
        if (result) {
            CDUPerformancePage.UpdateThrRedAccFromOrigin(mcdu);
            CDUPerformancePage.UpdateEngOutAccFromOrigin(mcdu);

            if (originTransAlt > 0) {
                mcdu.flightPlanManager.setOriginTransitionAltitude(originTransAlt, true);
            }
            if (destinationTransLevel > 0) {
                mcdu.flightPlanManager.setDestinationTransitionLevel(destinationTransLevel / 100, true);
            }

            await mcdu.tryUpdateAltDestination(alternateIcao);

            setTimeout(async () => {
                await uplinkRoute(mcdu);
                mcdu.addNewMessage(NXSystemMessages.aocActFplnUplink);
            }, mcdu.getDelayRouteChange());

            if (mcdu.page.Current === mcdu.page.InitPageA) {
                CDUInitPage.ShowPage1(mcdu);
            }
        }
    });
    mcdu.updateFlightNo(callsign, (result) => {
        if (result) {
            if (mcdu.page.Current === mcdu.page.InitPageA) {
                CDUInitPage.ShowPage1(mcdu);
            }
        }
    });

    /**
     * INIT PAGE DATA UPLINK
    */
    setTimeout(() => {
        mcdu.setCruiseFlightLevelAndTemperature(cruiseAltitude);
        mcdu.tryUpdateCostIndex(costIndex);
        mcdu.tryUpdateTropo(avgTropopause);
        if (mcdu.page.Current === mcdu.page.InitPageA) {
            CDUInitPage.ShowPage1(mcdu);
        }
    }, mcdu.getDelayHigh());
};

const addWaypointAsync = (fix, mcdu, routeIdent, via) => {
    const wpIndex = mcdu.flightPlanManager.getWaypointsCount() - 1;
    if (via) {
        return new Promise((res, rej) => {
            mcdu.insertWaypointsAlongAirway(routeIdent, wpIndex, via, (result) => {
                if (result) {
                    console.log("Inserted waypoint: " + routeIdent + " via " + via);
                    res(true);
                } else {
                    console.log('AWY/WPT MISMATCH ' + routeIdent + " via " + via);
                    mcdu.addNewMessage(NXSystemMessages.awyWptMismatch);
                    res(false);
                }
            });
        });
    } else {
        return new Promise((res, rej) => {
            const coords = {
                lat: fix.pos_lat,
                long: fix.pos_long
            };
            getWaypointByIdentAndCoords(mcdu, routeIdent, coords, (waypoint) => {
                if (waypoint) {
                    mcdu.flightPlanManager.addWaypoint(waypoint.icao, wpIndex, () => {
                        console.log("Inserted waypoint: " + routeIdent);
                        res(true);
                    }).catch(console.error);
                } else {
                    console.log('NOT IN DATABASE ' + routeIdent);
                    mcdu.addNewMessage(NXSystemMessages.notInDatabase);
                    res(false);
                }
            });
        });
    }
};

const addLatLonWaypoint = async (mcdu, lat, lon) => {
    try {
        const wp = mcdu.dataManager.createLatLonWaypoint(new LatLongAlt(lat, lon), true);
        await mcdu.flightPlanManager.addUserWaypoint(wp);
    } catch (err) {
        if (err instanceof McduMessage) {
            mcdu.addNewMessage(err);
        } else {
            console.error(err);
        }
    }
};

const AddSID = (RWEnd, fix, mcdu) => {
    const SIDss = [];
    let SIDName = "";
    let TRANSITIONName = "";

    const fixx = fix;
    let rwy = "";
    let shortRwy = "";

    let j, r, t, gr = -1;
    let FindSid = false;
    let FindTrans = false;

    const originAirport = mcdu.flightPlanManager.getOrigin();
    const originAirportInfo = originAirport.infos;

    const originRunways = originAirportInfo.oneWayRunways;

    for (let i = 0; i < originRunways.length; i++) {
        rwy = originRunways[i].designation;
        shortRwy = rwy;
        const re = /[0-9]+/;
        const rwyDig = rwy.match(re);
        if (rwyDig < 10) {

            rwy = "0" + rwy;
        }
        if (mcdu.simbrief.originRwy === rwy) {
            gr = i;
            break;
        }
    }
    //Not found rwy in navdata
    if (gr < 0) {
        return SIDss;
    }

    for (j = 0; j < originAirportInfo.departures.length; j++) {
        const departure = originAirportInfo.departures[j];
        for (r = 0; r < departure.runwayTransitions.length; r++) {
            const runwayTransition = departure.runwayTransitions[r];
            if (shortRwy.indexOf(runwayTransition.name.slice(2,runwayTransition.name.length)) !== -1) {
                if (departure.commonLegs.length > 0) {
                    if (departure.commonLegs[departure.commonLegs.length - 1].fixIcao.substr(7, 12).trim() === fixx) {
                        t = -1;
                        FindSid = true;
                        break;
                    } else {

                        for (t = 0; t < departure.enRouteTransitions.length; t++) {
                            const enRouteTransition = departure.enRouteTransitions[t];
                            if (enRouteTransition.commonLegs[enRouteTransition.commonLegs.length - 1].fixIcao.substr(7, 12).trim() === fixx) {
                                FindSid = true;
                                FindTrans = true;
                                break;
                            }
                        }

                    }
                } else if (runwayTransition.legs.length > 0) {
                    if (runwayTransition.legs[runwayTransition.legs.length - 1].fixIcao.substr(7, 12).trim() === fixx) {
                        t = -1;
                        FindSid = true;
                        break;
                    } else {

                        for (t = 0; t < departure.enRouteTransitions.length; t++) {
                            const enRouteTransition = departure.enRouteTransitions[t];
                            if (enRouteTransition.commonLegs[enRouteTransition.commonLegs.length - 1].fixIcao.substr(7, 12).trim() === fixx) {
                                FindSid = true;
                                FindTrans = true;
                                break;
                            }
                        }

                    }
                }
            }
        }
        if (FindSid) {
            SIDName = originAirportInfo.departures[j].name;
            if (FindTrans) {
                TRANSITIONName = originAirportInfo.departures[j].enRouteTransitions[t].name;
            }
            SIDss.push({r: gr, t: t, tr: r, j: j, SIDName: SIDName, TRANSITIONName: TRANSITIONName, RWName: RWEnd});
            FindSid = false;
            FindTrans = false;
        }
    }
    return SIDss;
};

const uplinkRoute = async (mcdu) => {
    const fpm = mcdu.flightPlanManager;
    const ass = await SimVar.GetSimVarValue("L:A32NX_AUTO_SID_STAR", "Number");
    const add = await SimVar.GetSimVarValue("L:A32NX_AUTO_DELETE_DISCONTINUITY", "Number");
    let initRunwaySet = 0;
    let initSidSet = 0;
    let initSidTransSet = 0;
    let OrigSids = [];
    let wp;
    let wps;
    const {navlog} = mcdu.simbrief;

    const procedures = new Set(navlog.filter(fix => fix.is_sid_star === "1").map(fix => fix.via_airway));

    let SimBriefSID = "";
    let FixSID = "";
    let SimBriefSTAR = "";
    let FixSTAR = "";

    for (let i = 0; i < navlog.length; i++) {
        const fix = navlog[i];
        const nextFix = navlog[i + 1];

        if (fix.is_sid_star === '1') {
            continue;
        }
        if (["TOP OF CLIMB", "TOP OF DESCENT"].includes(fix.name)) {
            continue;
        }

        console.log('---- ' + fix.ident + ' ----');

        if (fix.type === 'ltlg') {
            console.log(`Inserting lat/lon waypoint ${fix.pos_lat}/${fix.pos_long}`);
            await addLatLonWaypoint(mcdu, parseFloat(fix.pos_lat), parseFloat(fix.pos_long));
            continue;
        }

        // Last SID fix - either it's airway is in the list of procedures, or
        // this is the very first fix in the route (to deal with procedures
        // that only have an exit fix, which won't be caught when filtering)
        if (procedures.has(fix.via_airway) || (i == 0)) {
            console.log("Inserting waypoint last of DEP: " + fix.ident);
            await addWaypointAsync(fix, mcdu, fix.ident);
            SimBriefSID = fix.via_airway;
            FixSID = fix.ident;
            continue;
        } else {
            if (fix.via_airway === 'DCT') {
                if (fix.type === 'apt' && nextFix === undefined) {
                    break;
                }
                console.log("Inserting waypoint: " + fix.ident);
                await addWaypointAsync(fix, mcdu, fix.ident);
                continue;
            }
            if (nextFix.via_airway !== fix.via_airway) {
                // last fix of airway
                console.log("Inserting waypoint: " + fix.ident + " via " + fix.via_airway);
                await addWaypointAsync(fix, mcdu, fix.ident, fix.via_airway);
                continue;
            }
        }
        if (procedures.has(nextFix.via_airway)) {
            SimBriefSTAR = nextFix.via_airway;
            FixSTAR = fix.ident;
            continue;
        }
    }
    if (ass === 1) {
        OrigSids = AddSID(mcdu.simbrief.originRwy, FixSID, mcdu);
        let findSID = -1;
        for (let i = 0; i < OrigSids.length; i++) {
            if (OrigSids[i].SIDName === SimBriefSID) {
                findSID = i;
            }
        }

        if (OrigSids.length > 0) {
            if (initRunwaySet == 0) {
                initRunwaySet = 1;
                mcdu.setOriginRunwayIndex(OrigSids[findSID].r, () => {
                    SimVar.SetSimVarValue("L:A32NX_SET_RUNWAY_ORIGIN", "Number", 1);
                    initRunwaySet = 2;
                    if ((initRunwaySet === 2) && (initSidSet === 0)) {
                        initSidSet = 1;
                        mcdu.setRunwayIndex(OrigSids[findSID].tr, () => {
                            mcdu.setDepartureIndex(OrigSids[findSID].j, () => {
                                SimVar.SetSimVarValue("L:A32NX_SET_SID_ORIGIN", "Number", 1);
                                initSidSet = 2;
                                if ((initSidSet == 2) && (initSidTransSet == 0)) {
                                    initSidTransSet = 1;
                                    fpm.setDepartureEnRouteTransitionIndex(OrigSids[findSID].t, () => {
                                        initSidTransSet = 2;
                                        if (initSidTransSet == 2) {
                                            SimVar.SetSimVarValue("L:A32NX_SET_TRANSITION_ORIGIN", "Number", 1);
                                            initSidTransSet = 3;
                                            mcdu.updateConstraints();
                                            mcdu.onToRwyChanged();
                                            CDUPerformancePage.UpdateThrRedAccFromOrigin(mcdu, true, true);
                                            CDUPerformancePage.UpdateEngOutAccFromOrigin(mcdu);
                                            mcdu.insertTemporaryFlightPlan(() => {
                                                if (add === 1) {
                                                    let first = 0;
                                                    let countWaypoints = fpm.getWaypointsCount();
                                                    for (let i = 0; i < countWaypoints; i++) {
                                                        wp = fpm.getWaypoint(i);
                                                        if (wp.ident === FixSID) {
                                                            if (first === 0) {
                                                                first = 1;
                                                                continue;
                                                            } else if (first === 1) {
                                                                fpm.removeWaypoint(i);
                                                                countWaypoints = fpm.getWaypointsCount();
                                                                first = -1;
                                                            }
                                                        } else {
                                                            first = 0;
                                                        }
                                                    }
                                                    for (let i = 0; i < fpm.getWaypointsCount(); i++) {
                                                        wp = fpm.getWaypoint(i);
                                                        if (wp.endsInDiscontinuity) {
                                                            fpm.clearDiscontinuity(i);
                                                        }
                                                    }
                                                    SimVar.SetSimVarValue("L:A32NX_SET_CLEAR_DISCONTINUITY", "Number", 1);
                                                }
                                                CDUFlightPlanPage.ShowPage(mcdu, 0);
                                            });
                                        }
                                    }).catch(console.error);
                                }
                            });
                        });
                    }
                });
            }

        }
    }
};

/**
 * Get the waypoint by ident and coords within the threshold
 * @param {string} ident Waypoint ident
 * @param {object} coords Waypoint coords
 * @param {function} callback Return waypoint
 */
function getWaypointByIdentAndCoords(mcdu, ident, coords, callback) {
    const DISTANCE_THRESHOLD = 1;
    mcdu.dataManager.GetWaypointsByIdent(ident).then((waypoints) => {
        if (!waypoints || waypoints.length === 0) {
            return callback(undefined);
        }

        for (waypoint of waypoints) {
            const distanceToTarget = Avionics.Utils.computeGreatCircleDistance(coords, waypoint.infos.coordinates);
            if (distanceToTarget < DISTANCE_THRESHOLD) {
                return callback(waypoint);
            }
        }

        return callback(undefined);
    }).catch(console.error);
}
