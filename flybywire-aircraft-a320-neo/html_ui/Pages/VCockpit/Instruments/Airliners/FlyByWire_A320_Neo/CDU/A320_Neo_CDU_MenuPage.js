class CDUMenuPage {
    static ShowPage(mcdu) {
        mcdu.clearDisplay();
        mcdu.page.Current = mcdu.page.MenuPage;
        const activeSystem = mcdu.activeSystem;
        let textATSU;
        let textFMGC;
        let textAIDS;
        let textCFDS;
        let textMaint;
        let textIF;
        let selectedFMGC = false;
        let selectedATSU = false;
        let selectedAIDS = false;
        let selectedCFDS = false;
        const selectedMaint = false;

        const updateView = () => {
            textFMGC = "<FMGC (REQ)";
            textATSU = "<ATSU";
            textAIDS = "<AIDS";
            textCFDS = "<CFDS";
            textIF = "*INIT FLIGHT";
            textMaint = "MCDU MAINT>";
            if (activeSystem === "FMGC") {
                textFMGC = "<FMGC (REQ)[color]green";
            }
            if (SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Int") === 0 || SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Int") === 20) {
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
                [textIF],
                [""],
                [""]
            ]);
        };

        updateView();

        A32NX_InitFlight.MCDU = mcdu;
        A32NX_InitFlight.UPDATE_VIEW = updateView;
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_AOC", "Number", 0); // For tests
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_FLTNBR", "Number", 0); // For tests
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_UPLINK", "Number", 0); // For tests
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number", 0); // For tests
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_TARGETPAX", "Number", 0); // For tests
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 0);

        mcdu.setScratchpadMessage(NXSystemMessages.selectDesiredSystem);

        mcdu.onLeftInput[0] = () => {
            mcdu.setScratchpadMessage(NXSystemMessages.waitForSystemResponse);
            selectedFMGC = true;
            updateView();
            setTimeout(() => {
                mcdu.removeScratchpadMessage(NXSystemMessages.waitForSystemResponse.text);
                CDUIdentPage.ShowPage(mcdu);
            }, Math.floor(Math.random() * 400) + 200);
        };

        mcdu.onLeftInput[1] = () => {
            mcdu.setScratchpadMessage(NXSystemMessages.waitForSystemResponse);
            selectedATSU = true;
            updateView();
            setTimeout(() => {
                mcdu.removeScratchpadMessage(NXSystemMessages.waitForSystemResponse.text);
                CDUAtsuMenu.ShowPage(mcdu);
            }, Math.floor(Math.random() * 400) + 200);
        };

        mcdu.onLeftInput[2] = () => {
            mcdu.setScratchpadMessage(NXSystemMessages.waitForSystemResponse);
            selectedAIDS = true;
            updateView();
            setTimeout(() => {
                mcdu.removeScratchpadMessage(NXSystemMessages.waitForSystemResponse.text);
                CDU_AIDS_MainMenu.ShowPage(mcdu);
            }, Math.floor(Math.random() * 400) + 400);
        };

        mcdu.onLeftInput[3] = () => {
            mcdu.setScratchpadMessage(NXSystemMessages.waitForSystemResponse);
            selectedCFDS = true;
            updateView();
            setTimeout(() => {
                mcdu.removeScratchpadMessage(NXSystemMessages.waitForSystemResponse.text);
                CDUCfdsMainMenu.ShowPage(mcdu);
            }, Math.floor(Math.random() * 400) + 400);
        };

        mcdu.onLeftInput[4] = async () => {
            if (SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Int") === 0 || SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Int") === 20) {
                A32NX_InitFlight.MCDU = mcdu;
                A32NX_InitFlight.UPDATE_VIEW = updateView;
                await SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 1);
                updateView();
            }
        };
    }
}
