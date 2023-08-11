class CDUMenuPage {
    static ShowPage(mcdu) {
        mcdu.clearDisplay();
        mcdu.page.Current = mcdu.page.MenuPage;
        // The MCDU MENU does not maintain an editable scratchpad... subsystems and the backup nav do that.
        mcdu.activateMcduScratchpad();

        const fmActive = mcdu.activeSystem === "FMGC";
        const atsuActive = mcdu.activeSystem === "ATSU";
        const aidsActive = mcdu.activeSystem === "AIDS";
        const cfdsActive = mcdu.activeSystem === "CFDS";

        let textIF = "*INIT FLIGHT";
        let colorIF = Column.white;
        // delay to get text and draw already connected subsystem page
        const connectedSubsystemDelay = 200;
        // delay to establish initial communication with disconnect systems on low speed ports
        const disconnectedSubsystemDelay = Math.floor(Math.random() * 800) + 500;

        /**
         * Updates the page text.
         * @param {"FMGC" | "ATSU" | "AIDS" | "CFDS" | null} selectedSystem Newly selected system establishing comms, or null if none.
         */
        const updateView = (selectedSystem = null) => {
            textIF = "*INIT FLIGHT";
            if (SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Int") === 0 || SimVar.GetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Int") === 20) {
                textIF = "*INIT FLIGHT";
                colorIF = Column.cyan;
            } else {
                textIF = " INIT FLIGHT";
                colorIF = Column.red;
            }
            const getText = (name, isRequesting = false, isLeft = true) => {
                let flag = null;
                if (selectedSystem !== null) {
                    if (selectedSystem === name) {
                        flag = "(SEL)";
                    }
                } else if (isRequesting) {
                    flag = "(REQ)";
                }
                if (isLeft) {
                    return `${name}\xa0${flag !== null ? flag : ""}`;
                } else {
                    return `${flag !== null ? flag : ""}\xa0${name}`;
                }
            };
            const getColor = (isActive, isSelected) => isSelected ? Column.cyan : (isActive && selectedSystem === null ? Column.green : Column.white);

            mcdu.setTemplate(FormatTemplate([
                [new Column(7, "MCDU MENU")],
                [new Column(22, "SELECT", Column.right, Column.inop)],
                [
                    new Column(0, getText("<FMGC", mcdu.isSubsystemRequesting("FMGC")), getColor(fmActive, selectedSystem === "FMGC")),
                    new Column(23, "NAV B/UP>", Column.right, Column.inop)
                ],
                [""],
                [new Column(0, getText("<ATSU", mcdu.isSubsystemRequesting("ATSU")), getColor(atsuActive, selectedSystem === "ATSU"))],
                [""],
                [new Column(0, getText("<AIDS", mcdu.isSubsystemRequesting("AIDS")), getColor(aidsActive, selectedSystem === "AIDS"))],
                [""],
                [new Column(0, getText("<CFDS", mcdu.isSubsystemRequesting("CFDS")), getColor(cfdsActive, selectedSystem === "CFDS"))],
                [""],
                //TO DO Fact required
                [new Column(0, getText(textIF), colorIF)],
                ///////////////
                [""],
                [""]
            ]));
        };

        updateView();

        mcdu.mcduScratchpad.setMessage(NXSystemMessages.selectDesiredSystem);
        A32NX_InitFlight.MCDU = mcdu;
        A32NX_InitFlight.UPDATE_VIEW = updateView;
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_AOC", "Number", 0); // For tests
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_FLTNBR", "Number", 0); // For tests
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_UPLINK", "Number", 0); // For tests
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_LOADFUEL", "Number", 0); // For tests
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_TARGETPAX", "Number", 0); // For tests
        SimVar.SetSimVarValue("L:A32NX_INITFLIGHT_STATE", "Number", 0);


        mcdu.onLeftInput[0] = () => {
            mcdu.mcduScratchpad.setMessage(NXSystemMessages.waitForSystemResponse);
            updateView("FMGC");
            setTimeout(() => {
                mcdu.mcduScratchpad.removeMessage(NXSystemMessages.waitForSystemResponse.text);
                CDUIdentPage.ShowPage(mcdu);
            }, connectedSubsystemDelay); // FMGCs are on high-speed port... always fast
        };

        mcdu.onLeftInput[1] = () => {
            mcdu.mcduScratchpad.setMessage(NXSystemMessages.waitForSystemResponse);
            updateView("ATSU");
            setTimeout(() => {
                mcdu.mcduScratchpad.removeMessage(NXSystemMessages.waitForSystemResponse.text);
                CDUAtsuMenu.ShowPage(mcdu);
            }, atsuActive ? connectedSubsystemDelay : disconnectedSubsystemDelay);
        };

        mcdu.onLeftInput[2] = () => {
            mcdu.mcduScratchpad.setMessage(NXSystemMessages.waitForSystemResponse);
            updateView("AIDS");
            setTimeout(() => {
                mcdu.mcduScratchpad.removeMessage(NXSystemMessages.waitForSystemResponse.text);
                CDU_AIDS_MainMenu.ShowPage(mcdu);
            }, aidsActive ? connectedSubsystemDelay : disconnectedSubsystemDelay);
        };

        mcdu.onLeftInput[3] = () => {
            mcdu.mcduScratchpad.setMessage(NXSystemMessages.waitForSystemResponse);
            updateView("CFDS");
            setTimeout(() => {
                mcdu.mcduScratchpad.removeMessage(NXSystemMessages.waitForSystemResponse.text);
                CDUCfdsMainMenu.ShowPage(mcdu);
            }, cfdsActive ? connectedSubsystemDelay : disconnectedSubsystemDelay);
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
