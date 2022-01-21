class CDUMenuPage {
    static ShowPage(mcdu) {
        mcdu.clearDisplay();
        mcdu.page.Current = mcdu.page.MenuPage;
        const activeSystem = mcdu.activeSystem;
        //TO DO Fact required
        let textIF;
        let colorIF;
        ///////////////
        let selectedFMGC = false;
        let selectedATSU = false;
        let selectedAIDS = false;
        let selectedCFDS = false;
        //const selectedMaint = false;

        const updateView = () => {
            const getText = (name, isSelected, extra = "", isLeft = true) => isSelected ? (isLeft ? name + " (SEL)" : "(SEL) " + name) : name + extra;
            const getColor = (system, isSelected) => isSelected ? Column.cyan : system === activeSystem ? Column.green : Column.white;
            //TO DO Fact required
            textIF = "*INIT FLIGHT";
            if (SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Int") === 0 || SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Int") === 20) {
                textIF = "*INIT FLIGHT";
                colorIF = Column.cyan;
            } else {
                textIF = " INIT FLIGHT";
                colorIF = Column.red;
            }
            ///////////////
            mcdu.setTemplate(FormatTemplate([
                [new Column(7, "MCDU MENU")],
                [new Column(22, "SELECT", Column.right)],
                [
                    new Column(0, getText("<FMGC", selectedFMGC, " (REQ)"), getColor("FMGC", selectedFMGC)),
                    new Column(23, "NAV B/UP>", Column.right)
                ],
                [""],
                [new Column(0, getText("<ATSU", selectedATSU), getColor("ATSU", selectedATSU))],
                [""],
                [new Column(0, getText("<AIDS", selectedAIDS), getColor("AIDS", selectedAIDS))],
                [""],
                [new Column(0, getText("<CFDS", selectedCFDS), getColor("CFDS", selectedCFDS))],
                [""],
                //[new Column(0, getText("MCDU MAINT>", selectedMaint, "", false), Column.right, getColor("MAINT", selectedMaint))],
                //TO DO Fact required
                [new Column(0, textIF, colorIF)],
                ///////////////
                [""],
                [""]
            ]));
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
