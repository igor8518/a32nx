class CDUMenuPage {
    static ShowPage(mcdu, FlightDone = true) {
        mcdu.clearDisplay();
        mcdu.page.Current = mcdu.page.MenuPage;
        const activeSystem = mcdu.activeSystem;
        let textATSU;
        let textFMGC;
        let textAIDS;
        let textCFDS;
        let textMaint;
        let textReturn;
        let textIF;
        let initSimbrief = false;
        let selectedFMGC = false;
        let selectedATSU = false;
        let selectedAIDS = false;
        let selectedCFDS = false;
        let selectedMaint = true;
        let initFlightDone = FlightDone;
        let setFlightPlan = false;

        const updateView = () => {
            //if (FlightDone === undefinrd) {
            //initFlightDone = true;
            //}
            if (!initFlightDone) {
                InitFlight(mcdu);
            }
            textFMGC = "<FMGC (REQ)";
            textATSU = "<ATSU";
            textAIDS = "<AIDS";
            textCFDS = "<CFDS";
            textIF = "* INIT FLIGHT";
            textMaint = "MCDU MAINT>";
            textReturn = "RETURN>";
            if (activeSystem === "FMGC") {
                textFMGC = "<FMGC (REQ)[color]green";
            }
            if (initFlightDone) {
                textIF = "*INIT FLIGHT[color]cyan";
            } else {
                textIF = " INIT FLIGHT[color]red";
            }
            if (activeSystem === "ATSU") {
                textATSU = "<ATSU[color]green";
            }
            if (activeSystem === "AIDS") {
                textAIDS = "<AIDS[color]green";
            }
            if (activeSystem === "CFDS") {
                textCFDS = "<CFDS[color]green";
            }
            if (activeSystem === "MAINT") {
                textMaint = "MCDU MAINT>[color]green";
            }
            if (selectedFMGC) {
                textFMGC = "<FMGC (SEL)[color]cyan";
            }
            if (selectedATSU) {
                textATSU = "<ATSU (SEL)[color]cyan";
            }
            if (selectedAIDS) {
                textAIDS = "<AIDS (SEL)[color]cyan";
            }
            if (selectedCFDS) {
                textCFDS = "<CFDS (SEL)[color]cyan";
            }
            if (selectedMaint) {
                textMaint = "(SEL) MCDU MAINT>[color]cyan";
            }

            mcdu.setTemplate([
                ["MCDU MENU"],
                ["", "SELECT\xa0"],
                [textFMGC, "NAV B/UP>"],
                [""],
                [textATSU],
                [""],
                [textAIDS],
                [""],
                [textCFDS],
                [""],
                [textIF, "OPTIONS>"],
                [""],
                ["", textReturn]
            ]);
        };

        updateView();

        mcdu.addNewMessage(NXSystemMessages.selectDesiredSystem);

        mcdu.onLeftInput[0] = () => {
            mcdu.addNewMessage(NXSystemMessages.waitForSystemResponse);
            selectedFMGC = true;
            updateView();
            setTimeout(() => {
                mcdu.addNewMessage(NXFictionalMessages.emptyMessage);
                CDUIdentPage.ShowPage(mcdu);
            }, Math.floor(Math.random() * 400) + 100);
        };

        mcdu.onLeftInput[1] = () => {
            mcdu.addNewMessage(NXSystemMessages.waitForSystemResponse);
            selectedATSU = true;
            updateView();
            setTimeout(() => {
                mcdu.addNewMessage(NXFictionalMessages.emptyMessage);
                CDUAtsuMenu.ShowPage(mcdu);
            }, Math.floor(Math.random() * 400) + 200);
        };

        mcdu.onLeftInput[2] = () => {
            mcdu.addNewMessage(NXSystemMessages.waitForSystemResponse);
            selectedAIDS = true;
            updateView();
            setTimeout(() => {
                mcdu.addNewMessage(NXFictionalMessages.emptyMessage);
                CDU_AIDS_MainMenu.ShowPage(mcdu);
            }, Math.floor(Math.random() * 400) + 400);
        };

        mcdu.onLeftInput[3] = () => {
            mcdu.addNewMessage(NXSystemMessages.waitForSystemResponse);
            selectedCFDS = true;
            updateView();
            setTimeout(() => {
                mcdu.addNewMessage(NXFictionalMessages.emptyMessage);
                CDUCfdsMainMenu.ShowPage(mcdu);
            }, Math.floor(Math.random() * 400) + 400);
        };

        mcdu.onLeftInput[4] = () => {
            if (initFlightDone) {
                //setFlightPlan = false;
                //initSimbrief = false;
                //initFlightDone = false;
                //mcdu.updateRequest = true;
                CDUMenuPage.ShowPage(mcdu, false);
            }
        };

        mcdu.onRightInput[4] = () => {
            mcdu.addNewMessage(NXSystemMessages.waitForSystemResponse);
            selectedMaint = true;
            updateView();
            setTimeout(() => {
                mcdu.addNewMessage(NXFictionalMessages.emptyMessage);
                CDU_OPTIONS_MainMenu.ShowPage(mcdu);
            }, Math.floor(Math.random() * 400) + 200);
        };

        mcdu.onDir = () => {
            const cur = mcdu.page.Current;
            setTimeout(() => {
                if (mcdu.page.Current === cur) {
                    CDUDirectToPage.ShowPage(mcdu);
                }
            }, mcdu.getDelaySwitchPage());
        };
        mcdu.onProg = () => {
            const cur = mcdu.page.Current;
            setTimeout(() => {
                if (mcdu.page.Current === cur) {
                    CDUProgressPage.ShowPage(mcdu);
                }
            }, mcdu.getDelaySwitchPage());
        };
        mcdu.onPerf = () => {
            if (mcdu.currentFlightPhase === FmgcFlightPhases.DONE) {
                mcdu.flightPhaseManager.changeFlightPhase(FmgcFlightPhases.PREFLIGHT);
            }
            const cur = mcdu.page.Current;
            setTimeout(() => {
                if (mcdu.page.Current === cur) {
                    CDUPerformancePage.ShowPage(mcdu);
                }
            }, mcdu.getDelaySwitchPage());
        };
        mcdu.onInit = () => {
            if (mcdu.currentFlightPhase === FmgcFlightPhases.DONE) {
                mcdu.flightPhaseManager.changeFlightPhase(FmgcFlightPhases.PREFLIGHT);
            }
            const cur = mcdu.page.Current;
            setTimeout(() => {
                if (mcdu.page.Current === cur) {
                    CDUInitPage.ShowPage1(mcdu);
                }
            }, mcdu.getDelaySwitchPage());
        };
        mcdu.onData = () => {
            const cur = mcdu.page.Current;
            setTimeout(() => {
                if (mcdu.page.Current === cur) {
                    CDUDataIndexPage.ShowPage1(mcdu);
                }
            }, mcdu.getDelaySwitchPage());
        };
        mcdu.onFpln = () => {
            const cur = mcdu.page.Current;
            setTimeout(() => {
                if (mcdu.page.Current === cur) {
                    CDUFlightPlanPage.ShowPage(mcdu);
                }
            }, mcdu.getDelaySwitchPage());
        };
        mcdu.onSec = () => {
            const cur = mcdu.page.Current;
            setTimeout(() => {
                if (mcdu.page.Current === cur) {
                    CDUSecFplnMain.ShowPage(mcdu);
                }
            }, mcdu.getDelaySwitchPage());
        };
        mcdu.onRad = () => {
            const cur = mcdu.page.Current;
            setTimeout(() => {
                if (mcdu.page.Current === cur) {
                    CDUNavRadioPage.ShowPage(mcdu);
                }
            }, mcdu.getDelaySwitchPage());
        };
        mcdu.onFuel = () => {
            const cur = mcdu.page.Current;
            setTimeout(() => {
                if (mcdu.page.Current === cur) {
                    CDUFuelPredPage.ShowPage(mcdu);
                }
            }, mcdu.getDelaySwitchPage());
        };

        function InitFlight(mcdu) {
            //For autoflight branch
            //if (!initSimbrief) {
            //initFlightDone = false;
            //updateView();
            //CDUInitPage.ShowPage1(mcdu);
            //updateView();
            initFlightDone = true;
            if (!setFlightPlan) {
                mcdu.sendDataToScratchpad("GET SIMBRIEF");
                getSimBriefOfp(mcdu, updateView)
                    .then(() => {
                        mcdu.sendDataToScratchpad("INIT FLIGHTPLAN");
                        insertUplink(mcdu);
                    });
                setFlightPlan = true;
            }
            //initFlightDone = false;
            async function setFuel() {
                await loadFuel(mcdu, updateView);
            }
            if (mcdu.currentFlightPhase === FmgcFlightPhases.DONE) {
                mcdu.flightPhaseManager.changeFlightPhase(FmgcFlightPhases.PREFLIGHT);
            }
            //const cur = mcdu.page.Current;
            //setTimeout(() => {
            //if (mcdu.page.Current === cur) {

            //updateView();
            mcdu.sendDataToScratchpad("PREPARE FUEL");
            if (mcdu.aocWeight.blockFuel || mcdu.simbrief.blockFuel) {
                mcdu.sendDataToScratchpad("SET FUEL");
                initFlightDone = true;
                setFuel();
                // initFlightDone = false;
            } else {
                //CDUInitPage.ShowPage1(mcdu);
                // mcdu.requestUpdate();
                //}
                //}, mcdu.getDelaySwitchPage());
                // CDUMenuPage.ShowPage(mcdu, false);
                initFlightDone = false;
                mcdu.updateRequest = true;
                return;
            };
            async function setPayLoad() {
                await loadBaggagePayload(mcdu, updateView);
            };
            if (mcdu.aocWeight.payload || mcdu.simbrief.payload) {
                mcdu.sendDataToScratchpad("SET PAYLOAD");
                initFlightDone = true;
                setPayLoad();
                //initFlightDone = false;
                initSimbrief = true;
            } else {
                initFlightDone = false;
                mcdu.updateRequest = true;
                return;
            };
            //}
            if (initSimbrief) {
                initFlightDone = true;
                if (mcdu.zeroFuelWeight && mcdu.zeroFuelWeightMassCenter) {
                    mcdu.sendDataToScratchpad("SET ZFW");
                    mcdu.updateZfwVars();
                    mcdu.trySetZeroFuelWeightZFWCG((isFinite(mcdu.zeroFuelWeight) ? (NXUnits.kgToUser(mcdu.zeroFuelWeight)).toFixed(1) : "") +
                    "/" +
                    (isFinite(mcdu.zeroFuelWeightMassCenter) ? mcdu.zeroFuelWeightMassCenter.toFixed(1) : ""));
                }
                async function Planning1() {
                    if (await mcdu.tryFuelPlanning()) {
                        CDUInitPage.updateTowIfNeeded(mcdu);
                    }
                }
                async function Planning2() {
                    if (await mcdu.tryFuelPlanning()) {
                        CDUInitPage.updateTowIfNeeded(mcdu);
                        CDUInitPage.trySetFuelPred(mcdu);
                    }
                }
                if (mcdu._zeroFuelWeightZFWCGEntered && !mcdu._blockFuelEntered) {
                    mcdu.sendDataToScratchpad("SET PLANNING");
                    initFlightDone = true;
                    Planning1();
                    //initFlightDone = false;
                } else {

                    initFlightDone = false;
                    mcdu.updateRequest = true;
                    return;
                }
                if (mcdu._fuelPlanningPhase === mcdu._fuelPlanningPhases.IN_PROGRESS) {
                    mcdu.sendDataToScratchpad("SET BLOCK");
                    initFlightDone = true;
                    Planning2();
                    //initFlightDone = false;
                    mcdu.sendDataToScratchpad("SET FLAPS");
                    mcdu.trySetFlapsTHS("2");
                    mcdu.sendDataToScratchpad("SET V1");
                    mcdu.trySetV1Speed(mcdu._getV1Speed().toString());
                    mcdu.sendDataToScratchpad("SET VR");
                    mcdu.trySetVRSpeed(mcdu._getVRSpeed().toString());
                    mcdu.sendDataToScratchpad("SET V2");
                    mcdu.trySetV2Speed(mcdu._getV2Speed().toString());
                    mcdu.sendDataToScratchpad("INIT DONE");

                    initFlightDone = true;
                    initSimbrief = false;
                    const cur = mcdu.page.Current;
                    setTimeout(() => {
                        if (mcdu.page.Current === cur) {
                            CDUPerformancePage.ShowTAKEOFFPage(mcdu);
                        }
                    }, mcdu.getDelaySwitchPage());
                    return;
                } else {
                    initFlightDone = false;

                    mcdu.updateRequest = true;
                    return;
                }
            }
            // mcdu.updateRequest = true;
            ///////////////////////
        };
    }

}
