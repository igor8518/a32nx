class A32NX_InitFlight {

    constructor() {
        this.initFlight = "done";
        this.time = 0;
        this.notWay = 0;

    }
    async init() {
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_AOC", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_FLTNBR", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_UPLINK", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_TARGETPAX", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_SET_RUNWAY_ORIGIN", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_SET_SID_ORIGIN", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_SET_TRANSITION_ORIGIN", "Number", 0);
    }

    async update(_deltaTime) {
        if (this.notWay === 0) {
            const initFlightState = await SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number");
            this.notWay = 1;
            if (initFlightState == 0) {
                SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_AOC", "Number", 0);
                SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_FLTNBR", "Number", 0);
                SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_UPLINK", "Number", 0);
                SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number", 0);
                SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_TARGETPAX", "Number", 0);
                SimVar.SetSimVarValue("L:A32NX_SET_RUNWAY_ORIGIN", "Number", 0);
                SimVar.SetSimVarValue("L:A32NX_SET_SID_ORIGIN", "Number", 0);
                SimVar.SetSimVarValue("L:A32NX_SET_TRANSITION_ORIGIN", "Number", 0);
            }
            this.time += _deltaTime;

            if (await SimVar.GetSimVarValue("L:A32NX_FMGC_FLIGHT_PHASE", "Number") !== 5) {
                if (await SimVar.GetSimVarValue("L:A32NX_APPROACH_STATE", "Number") === 1) {
                    A32NX_InitFlight.MCDU.tryGoInApproachPhase();
                }
            } else {
                await SimVar.SetSimVarValue("L:A32NX_APPROACH_STATE", "Number", 1);
            }

            if (initFlightState === 20 || initFlightState === 0) {
                return;
            }
            if (initFlightState === 1) {
                A32NX_InitFlight.MCDU.addNewMessage(NXFictionalMessages.upLink);
                A32NX_InitFlight.UPDATE_VIEW();
                await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 2);
                getSimBriefOfp(A32NX_InitFlight.MCDU, () => {
                    if (A32NX_InitFlight.MCDU.page.Current === A32NX_InitFlight.MCDU.page.InitPageA) {
                        CDUInitPage.ShowPage1(A32NX_InitFlight.MCDU);
                    }
                })
                    .then(() => {
                        insertUplink(A32NX_InitFlight.MCDU);
                    });

                A32NX_InitFlight.UPDATE_VIEW();

            }
            if (initFlightState === 2) {
                if ((await SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_AOC", "Number") == 2)
             && (await SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_FLTNBR", "Number") == 2)
             && (await SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_UPLINK", "Number") == 3)) {
                    await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 3);
                }
            }
            if (initFlightState === 3) {

                await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 4);
                //TEST
                //loadFuel(A32NX_InitFlight.MCDU, A32NX_InitFlight.UPDATE_VIEW);
                await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number", 2);
                A32NX_InitFlight.MCDU._zeroFuelWeightZFWCGEntered = true;
                //
                await A32NX_InitFlight.UPDATE_VIEW();
            }
            if (initFlightState === 4) {
                if (await SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number") == 2) {
                    await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 5);
                    await A32NX_InitFlight.MCDU.addNewMessage(NXFictionalMessages.loadPax);
                    A32NX_InitFlight.UPDATE_VIEW();
                }

            }
            if (initFlightState === 5) {
                await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 6);
                await setTargetPax(A32NX_InitFlight.MCDU.simbrief.paxCount);
                A32NX_InitFlight.UPDATE_VIEW();
            }
            if (initFlightState === 6) {
                if (await SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_TARGETPAX", "Number") == 2) {
                    await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 7);
                    await SimVar.SetSimVarValue("L:A32NX_PAX_TOTAL_ROWS_1_6", "Int", 0);
                    await SimVar.SetSimVarValue("L:A32NX_PAX_TOTAL_ROWS_7_13", "Int", 0);
                    await SimVar.SetSimVarValue("L:A32NX_PAX_TOTAL_ROWS_14_21", "Int", 0);
                    await SimVar.SetSimVarValue("L:A32NX_PAX_TOTAL_ROWS_22_29", "Int", 0);
                    await SimVar.SetSimVarValue("L:A32NX_BOARDING_STARTED_BY_USR", "Number", 1);
                    await A32NX_InitFlight.MCDU.addNewMessage(NXFictionalMessages.loadPayload);
                    A32NX_InitFlight.UPDATE_VIEW();
                }

            }
            const boarding = await SimVar.GetSimVarValue("L:A32NX_BOARDING_STARTED_BY_USR", "Number");
            if (initFlightState === 7) {
                if (boarding === 1) {
                    await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 8);
                }
            }
            if (initFlightState === 8) {
                if (boarding == 0) {
                    await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 9);
                    await A32NX_InitFlight.MCDU.addNewMessage(NXFictionalMessages.prepareCDU);
                    A32NX_InitFlight.UPDATE_VIEW();
                }
            }

            if (initFlightState === 9) {
                await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 10);
                A32NX_InitFlight.MCDU.updateZfwVars();
                A32NX_InitFlight.MCDU.trySetZeroFuelWeightZFWCG((isFinite(A32NX_InitFlight.MCDU.zeroFuelWeight) ? (NXUnits.kgToUser(A32NX_InitFlight.MCDU.zeroFuelWeight)).toFixed(1) : "") +
                    "/" +
                    (isFinite(getZfwcg()) ? getZfwcg().toFixed(1) : ""));
            }

            async function Planning1() {
                if (await A32NX_InitFlight.MCDU.tryFuelPlanning()) {
                    CDUInitPage.updateTowIfNeeded(A32NX_InitFlight.MCDU);
                }
            }
            async function Planning2() {
                if (await A32NX_InitFlight.MCDU.tryFuelPlanning()) {
                    CDUInitPage.updateTowIfNeeded(A32NX_InitFlight.MCDU);
                    CDUInitPage.trySetFuelPred(A32NX_InitFlight.MCDU);
                }
            }
            if (initFlightState === 10) {

                A32NX_InitFlight.MCDU._fuelPlanningPhase = A32NX_InitFlight.MCDU._fuelPlanningPhases.PLANNING;
                A32NX_InitFlight.MCDU._blockFuelEntered = false;

                if (A32NX_InitFlight.MCDU._zeroFuelWeightZFWCGEntered && !A32NX_InitFlight.MCDU._blockFuelEntered) {
                    A32NX_InitFlight.MCDU.scratchpad.setText("SET PLANNING");
                    Planning1();

                } else {

                    A32NX_InitFlight.MCDU.updateRequest = true;
                    return;
                }
                if (A32NX_InitFlight.MCDU._fuelPlanningPhase === A32NX_InitFlight.MCDU._fuelPlanningPhases.IN_PROGRESS) {
                    A32NX_InitFlight.MCDU.scratchpad.setText("SET BLOCK");
                    Planning2();
                    await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 11);
                    A32NX_InitFlight.MCDU.scratchpad.setText("SET FLAPS");
                    A32NX_InitFlight.MCDU.trySetFlapsTHS("2");
                    A32NX_InitFlight.MCDU.scratchpad.setText("SET V1");
                    A32NX_InitFlight.MCDU.trySetV1Speed(A32NX_InitFlight.MCDU._getV1Speed().toString());
                    A32NX_InitFlight.MCDU.scratchpad.setText("SET VR");
                    A32NX_InitFlight.MCDU.trySetVRSpeed(A32NX_InitFlight.MCDU._getVRSpeed().toString());
                    A32NX_InitFlight.MCDU.scratchpad.setText("SET V2");
                    A32NX_InitFlight.MCDU.trySetV2Speed(A32NX_InitFlight.MCDU._getV2Speed().toString());
                    A32NX_InitFlight.MCDU.scratchpad.setText("SET FLEX");
                    A32NX_InitFlight.MCDU.setPerfTOFlexTemp(59);
                    A32NX_InitFlight.MCDU.scratchpad.setText("INIT DONE");

                    const cur = A32NX_InitFlight.MCDU.page.Current;
                    setTimeout(() => {
                        if (A32NX_InitFlight.MCDU.page.Current === cur) {
                            CDUPerformancePage.ShowTAKEOFFPage(A32NX_InitFlight.MCDU);
                            A32NX_InitFlight.MCDU.addNewMessage(NXFictionalMessages.done);
                            SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 20);
                        }
                    }, A32NX_InitFlight.MCDU.getDelaySwitchPage());
                    return;
                } else {
                    return;
                }
            }
        }
        this.notWay = 0;
    }
}
A32NX_InitFlight.MCDU = null;
A32NX_InitFlight.UPDATE_VIEW = null;
