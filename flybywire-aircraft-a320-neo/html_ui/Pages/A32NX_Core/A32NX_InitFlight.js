class A32NX_InitFlight {

    constructor() {
        this.initFlight = "done";
        this.time = 0;
        this.notWay = 0;

    }
    async setTargetPax(numberOfPax) {
        await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_TARGETPAX", "Number", 1);
        let paxRemaining = parseInt(numberOfPax);

        async function fillStation(station, percent, paxToFill) {

            const pax = Math.min(Math.trunc(percent * paxToFill), station.seats);
            station.pax = pax;

            await SimVar.SetSimVarValue(`L:${station.simVar}_DESIRED`, "Number", parseInt(pax));

            paxRemaining -= pax;
        }

        await fillStation(paxStations['rows22_29'], .28 , numberOfPax);
        await fillStation(paxStations['rows14_21'], .28, numberOfPax);
        await fillStation(paxStations['rows7_13'], .25 , numberOfPax);
        await fillStation(paxStations['rows1_6'], 1 , paxRemaining);

        await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_TARGETPAX", "Number", 2);
        return;
    }

    async setTargetCargo(numberOfPax, simbriefFreight) {
        await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_TARGETCARGO", "Number", 1);
        const BAG_WEIGHT = SimVar.GetSimVarValue("L:A32NX_WB_PER_BAG_WEIGHT", "Number");
        const bagWeight = numberOfPax * BAG_WEIGHT;
        const maxLoadInCargoHold = 9435; // from flight_model.cfg
        const loadableCargoWeight = Math.min(bagWeight + parseInt(simbriefFreight), maxLoadInCargoHold);

        let remainingWeight = loadableCargoWeight;

        async function fillCargo(station, percent, loadableCargoWeight) {
            const weight = Math.round(percent * loadableCargoWeight);
            station.load = weight;
            remainingWeight -= weight;
            await SimVar.SetSimVarValue(`L:${station.simVar}_DESIRED`, "Number", parseInt(weight));
        }

        await fillCargo(cargoStations['fwdBag'], .361 , loadableCargoWeight);
        await fillCargo(cargoStations['aftBag'], .220, loadableCargoWeight);
        await fillCargo(cargoStations['aftCont'], .251, loadableCargoWeight);
        await fillCargo(cargoStations['aftBulk'], 1, remainingWeight);
        await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_TARGETCARGO", "Number", 2);
        return;
    }

    async loadFuel(mcdu, updateView) {
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number", 1);
        const currentBlockFuel = Number(/*mcdu.aocWeight.blockFuel ||*/ mcdu.simbrief.blockFuel);
        SimVar.SetSimVarValue(`L:A32NX_SET_FUEL_DESIRED`, "Number", currentBlockFuel);
        SimVar.SetSimVarValue(`L:A32NX_FUEL_DESIRED`, "Number", currentBlockFuel);
        mcdu.aocWeight.loading = true;
        updateView();

        const outerTankCapacity = 228 + (1 * 2); // Left and Right // Value from flight_model.cfg (plus the unusable fuel capacity (GALLONS))
        const innerTankCapacity = 1816 + (7 * 2); // Left and Right // Value from flight_model.cfg (plus the unusable fuel capacity (GALLONS))
        const centerTankCapacity = 2179 + 6; // Center // Value from flight_model.cfg (plus the unusable fuel capacity (GALLONS))

        const fuelWeightPerGallon = SimVar.GetSimVarValue("FUEL WEIGHT PER GALLON", "kilograms");
        let currentBlockFuelInGallons = currentBlockFuel / fuelWeightPerGallon;
        SimVar.SetSimVarValue(`L:A32NX_FUEL_DESIRED_PERCENT`, "Number", (currentBlockFuelInGallons / 6267) * 100);
        SimVar.SetSimVarValue(`L:A32NX_FUEL_TOTAL_DESIRED`, "Number", currentBlockFuelInGallons);

        const outerTankFill = Math.min(outerTankCapacity, currentBlockFuelInGallons / 2);
        SimVar.SetSimVarValue(`L:A32NX_FUEL_LEFT_AUX_DESIRED`, "Number", outerTankFill);
        SimVar.SetSimVarValue(`L:A32NX_FUEL_RIGHT_AUX_DESIRED`, "Number", outerTankFill);
        currentBlockFuelInGallons -= outerTankFill * 2;

        const innerTankFill = Math.min(innerTankCapacity, currentBlockFuelInGallons / 2);
        SimVar.SetSimVarValue(`L:A32NX_FUEL_LEFT_MAIN_DESIRED`, "Number", innerTankFill);
        SimVar.SetSimVarValue(`L:A32NX_FUEL_RIGHT_MAIN_DESIRED`, "Number", innerTankFill);
        currentBlockFuelInGallons -= innerTankFill * 2;

        const centerTankFill = Math.min(centerTankCapacity, currentBlockFuelInGallons);
        SimVar.SetSimVarValue(`L:A32NX_FUEL_CENTER_DESIRED`, "Number", centerTankFill);
        currentBlockFuelInGallons -= centerTankFill;

        //mcdu.updateFuelVars();
        SimVar.SetSimVarValue("L:A32NX_REFUEL_STARTED_BY_USR", "Bool", true);
        mcdu.aocWeight.loading = false;
        updateView();
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number", 2);
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
                    A32NX_InitFlight.MCDU.flightPhaseManager.tryGoInApproachPhase();
                }
            } else {
                await SimVar.SetSimVarValue("L:A32NX_APPROACH_STATE", "Number", 1);
            }

            if (initFlightState === 20 || initFlightState === 0) {
                return;
            }
            if (initFlightState === 1) {
                A32NX_InitFlight.MCDU.setScratchpadMessage(NXFictionalMessages.upLink);
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
                loadFuel(A32NX_InitFlight.MCDU, A32NX_InitFlight.UPDATE_VIEW);
                //await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number", 2);
                A32NX_InitFlight.MCDU._zeroFuelWeightZFWCGEntered = true;
                //
                await A32NX_InitFlight.UPDATE_VIEW();
            }
            if (initFlightState === 4) {
                const centerCurrent = await SimVar.GetSimVarValue('FUEL TANK CENTER QUANTITY', 'Gallons');
                const LInnCurrent = await SimVar.GetSimVarValue('FUEL TANK LEFT MAIN QUANTITY', 'Gallons');
                const LOutCurrent = await SimVar.GetSimVarValue('FUEL TANK LEFT AUX QUANTITY', 'Gallons');
                const RInnCurrent = await SimVar.GetSimVarValue('FUEL TANK RIGHT MAIN QUANTITY', 'Gallons');
                const ROutCurrent = await SimVar.GetSimVarValue('FUEL TANK RIGHT AUX QUANTITY', 'Gallons');
                const fuelWeightPerGallon = await SimVar.GetSimVarValue("FUEL WEIGHT PER GALLON", "kilograms");
                const totalCurrentGallon = () => Math.round(Math.max((LInnCurrent + (LOutCurrent) + (RInnCurrent) + (ROutCurrent) + (centerCurrent)), 0));
                const TargetGallon = Math.round(Number(A32NX_InitFlight.MCDU.simbrief.blockFuel) / fuelWeightPerGallon);
                const CurrentGallon = totalCurrentGallon();
                if (TargetGallon === CurrentGallon) {
                    if (await SimVar.GetSimVarValue("L:A32NX_REFUEL_STARTED_BY_USR", "Bool")) {
                        SimVar.SetSimVarValue("L:A32NX_REFUEL_STARTED_BY_USR", "Bool", false);
                    }
                }
                if ((await SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number") == 2) && !(await SimVar.GetSimVarValue("L:A32NX_REFUEL_STARTED_BY_USR", "Bool"))) {
                    await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 5);
                    await A32NX_InitFlight.MCDU.setScratchpadMessage(NXFictionalMessages.loadPax);
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

                    await SimVar.SetSimVarValue("L:A32NX_PAX_TOTAL_ROWS_1_6", "Int", 0);
                    await SimVar.SetSimVarValue("L:A32NX_PAX_TOTAL_ROWS_7_13", "Int", 0);
                    await SimVar.SetSimVarValue("L:A32NX_PAX_TOTAL_ROWS_14_21", "Int", 0);
                    await SimVar.SetSimVarValue("L:A32NX_PAX_TOTAL_ROWS_22_29", "Int", 0);
                    await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 7);
                    await A32NX_InitFlight.MCDU.setScratchpadMessage(NXFictionalMessages.loadPayload);
                    A32NX_InitFlight.UPDATE_VIEW();
                }

            }
            if (initFlightState === 7) {
                await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 8);
                setDefaultWeights(A32NX_InitFlight.MCDU.simbrief.paxWeight, A32NX_InitFlight.MCDU.simbrief.bagWeight);
                setTargetPax(A32NX_InitFlight.MCDU.simbrief.paxCount).then(() => {
                    setTargetCargo(A32NX_InitFlight.MCDU.simbrief.bagCount, A32NX_InitFlight.MCDU.simbrief.freight).then(() => {
                        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 9);
                        SimVar.SetSimVarValue("L:A32NX_BOARDING_STARTED_BY_USR", "Number", 1);
                    });
                });
            }
            const boarding = await SimVar.GetSimVarValue("L:A32NX_BOARDING_STARTED_BY_USR", "Number");
            if (initFlightState === 9) {
                if (boarding === 1) {
                    await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 10);
                }
            }
            if (initFlightState === 10) {
                if (boarding == 0) {
                    await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 11);
                    await A32NX_InitFlight.MCDU.setScratchpadMessage(NXFictionalMessages.prepareCDU);
                    A32NX_InitFlight.UPDATE_VIEW();
                }
            }

            if (initFlightState === 11) {
                await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 12);
                A32NX_InitFlight.MCDU.trySetZeroFuelWeightZFWCG(
                    (isFinite(getZfw()) ? (NXUnits.kgToUser(getZfw() / 1000)).toFixed(1) : "") +
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
            if (initFlightState === 12) {

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
                    if (A32NX_InitFlight.MCDU._fuelPlanningPhase === A32NX_InitFlight.MCDU._fuelPlanningPhases.COMPLETED) {
                        await A32NX_InitFlight.MCDU.trySetBlockFuel(Math.round(Number(A32NX_InitFlight.MCDU.simbrief.blockFuel) / 100) / 10);

                        await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 13);
                        A32NX_InitFlight.MCDU.scratchpad.setText("SET FLAPS");
                        A32NX_InitFlight.MCDU.trySetFlapsTHS("2/UP" + String(0));
                        A32NX_InitFlight.MCDU.scratchpad.setText("SET V1");
                        A32NX_InitFlight.MCDU.trySetV1Speed((A32NX_InitFlight.MCDU._getV1Speed()).toString());
                        A32NX_InitFlight.MCDU.scratchpad.setText("SET VR");
                        A32NX_InitFlight.MCDU.trySetVRSpeed((A32NX_InitFlight.MCDU._getVRSpeed()).toString());
                        A32NX_InitFlight.MCDU.scratchpad.setText("SET V2");
                        A32NX_InitFlight.MCDU.trySetV2Speed((A32NX_InitFlight.MCDU._getV2Speed()).toString());
                        A32NX_InitFlight.MCDU.scratchpad.setText("SET FLEX");
                        A32NX_InitFlight.MCDU.setPerfTOFlexTemp(69);
                        A32NX_InitFlight.MCDU.scratchpad.setText("DONE");
                        A32NX_InitFlight.MCDU.setScratchpadMessage(NXFictionalMessages.done);
                        const cur = A32NX_InitFlight.MCDU.page.Current;
                        setTimeout(() => {
                            if (A32NX_InitFlight.MCDU.page.Current === cur) {
                                CDUPerformancePage.ShowTAKEOFFPage(A32NX_InitFlight.MCDU);
                                A32NX_InitFlight.MCDU.setScratchpadMessage(NXFictionalMessages.done);
                                SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 20);
                            }
                        }, A32NX_InitFlight.MCDU.getDelaySwitchPage());
                    }
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
