class A32NX_InitFlight {
    constructor() {
        this.initFlight = "done";
        this.time = 0;

    }
    async init() {
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_AOC", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_FLTNBR", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_UPLINK", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number", 0);
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_TARGETPAX", "Number", 0);
    }

    async update(_deltaTime) {
        this.time += _deltaTime;

        const initFlightState = await SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number");

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
                && (await SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_UPLINK", "Number") == 2)) {
                await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 3);
                await A32NX_InitFlight.MCDU.addNewMessage(NXFictionalMessages.loadFuel);
                await A32NX_InitFlight.updateView();
            }
        }
        if (initFlightState === 3) {

            await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 4);
            loadFuel(A32NX_InitFlight.MCDU, A32NX_InitFlight.UPDATE_VIEW);
            await A32NX_InitFlight.UPDATE_VIEW();
        }
        if (initFlightState === 4) {
            if (await SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number") == 2) {
                await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 5);
                await A32NX_InitFlight.MCDU.addNewMessage(NXFictionalMessages.loadPax);
                await A32NX_InitFlight.UPDATE_VIEW();
            }

        }
        if (initFlightState === 5) {
            await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 6);
            await setTargetPax(A32NX_InitFlight.MCDU.simbrief.paxCount);
            await A32NX_InitFlight.UPDATE_VIEW();
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
                await A32NX_InitFlight.UPDATE_VIEW();
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
                await A32NX_InitFlight.UPDATE_VIEW();
            }
        }

        if (initFlightState === 9) {
            await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 10);
            A32NX_InitFlight.MCDU.updateZfwVars();
            A32NX_InitFlight.MCDU.trySetZeroFuelWeightZFWCG((isFinite(A32NX_InitFlight.MCDU.zeroFuelWeight) ? (NXUnits.kgToUser(A32NX_InitFlight.MCDU.zeroFuelWeight)).toFixed(1) : "") +
                    "/" +
                    (isFinite(A32NX_InitFlight.MCDU.zeroFuelWeightMassCenter) ? A32NX_InitFlight.MCDU.zeroFuelWeightMassCenter.toFixed(1) : ""));
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
            await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 11);
            if (A32NX_InitFlight.MCDU._zeroFuelWeightZFWCGEntered && !A32NX_InitFlight.MCDU._blockFuelEntered) {
                A32NX_InitFlight.MCDU.sendDataToScratchpad("SET PLANNING");
                Planning1();

            } else {

                A32NX_InitFlight.MCDU.updateRequest = true;
                return;
            }
            if (A32NX_InitFlight.MCDU._fuelPlanningPhase === A32NX_InitFlight.MCDU._fuelPlanningPhases.IN_PROGRESS) {
                A32NX_InitFlight.MCDU.sendDataToScratchpad("SET BLOCK");
                Planning2();

                A32NX_InitFlight.MCDU.sendDataToScratchpad("SET FLAPS");
                A32NX_InitFlight.MCDU.trySetFlapsTHS("2");
                A32NX_InitFlight.MCDU.sendDataToScratchpad("SET V1");
                A32NX_InitFlight.MCDU.trySetV1Speed(A32NX_InitFlight.MCDU._getV1Speed().toString());
                A32NX_InitFlight.MCDU.sendDataToScratchpad("SET VR");
                A32NX_InitFlight.MCDU.trySetVRSpeed(A32NX_InitFlight.MCDU._getVRSpeed().toString());
                A32NX_InitFlight.MCDU.sendDataToScratchpad("SET V2");
                A32NX_InitFlight.MCDU.trySetV2Speed(A32NX_InitFlight.MCDU._getV2Speed().toString());
                A32NX_InitFlight.MCDU.sendDataToScratchpad("INIT DONE");

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
}
A32NX_InitFlight.MCDU = null;
A32NX_InitFlight.UPDATE_VIEW = null;
