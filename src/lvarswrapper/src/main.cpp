// Copyright (c) Asobo Studio, All rights reserved. www.asobostudio.com


#include <ini_type_conversion.h>
#include <MSFS\MSFS.h>

#include <MSFS\Legacy\gauges.h>
#include <SimConnect.h>

#include "LocalVariable.h"
#include "main.h"

std::unique_ptr<LocalVariable> ExportVars[MAX_OUTPUT_VARS-1];
double ExportVarsSet[MAX_OUTPUT_VARS];


std::vector<std::string> VarNames;


using namespace mINI;

enum EVENT_ID {
	EVENT_4SEC,
	SAVE_VARS,
  MIN_VAR_REQ_ID //Allways last
};

enum DATA_REQUEST_ID {
	REQ_CONTROL,
	REQ_ALLDATA,
};

enum GROUP_ID {
	GROUP_LOCAL_VARS
};

struct sExportData
{
	unsigned int id;
	double Data;
	DWORD version;
} ExportData;


char* LVars[100][1000];
int LVarsRequestID = MIN_VAR_REQ_ID;
int MaxLVars = 0;
const char* PreCust = "Autoflight.";

HANDLE hSimConnect = 0;
HRESULT hr;

struct A32NX_Control
{
	unsigned int id;
	double Parameter;
	DWORD version;
} Control;

DWORD Version = 999;
char ssstr[100];
char Lssstr[100];

const char* sstr = "";
const char* LVar = "";
char P[100];



template < typename T>
std::pair<bool, int > findInVector(const std::vector<T>& vecOfElements, const T& element)
{
	std::pair<bool, int > result;
	// Find given element in vector
	auto it = std::find(vecOfElements.begin(), vecOfElements.end(), element);
	if (it != vecOfElements.end())
	{
		result.second = distance(vecOfElements.begin(), it);
		result.first = true;
	}
	else
	{
		result.first = false;
		result.second = -1;
	}
	return result;
}

void AddVars() {
  LVarsRequestID = MaxLVars + MIN_VAR_REQ_ID;
  for (; LVarsRequestID < MAX_IDS_VARS; LVarsRequestID++) {
    LVar = get_name_of_named_variable(LVarsRequestID - MIN_VAR_REQ_ID);
    if (LVar[0] != '\0') {
      strcpy(P, PreCust);
      sstr = strcat(P, LVar);
      strcpy(ssstr, sstr);
      strcpy(Lssstr, LVar);
      std::pair<bool, int> result = findInVector<std::string>(VarNames, Lssstr);
      if (result.first) {
        ExportVars[result.second] = std::make_unique<LocalVariable>(std::string(Lssstr), ID(LVarsRequestID - MIN_VAR_REQ_ID), ID(result.second), ExportVarsSet);
      } else {
        sstr = "";
      }
      hr = SimConnect_MapClientEventToSimEvent(hSimConnect, LVarsRequestID, ssstr);
      hr = SimConnect_AddClientEventToNotificationGroup(hSimConnect, GROUP_LOCAL_VARS, LVarsRequestID);
      hr = SimConnect_SetNotificationGroupPriority(hSimConnect, GROUP_LOCAL_VARS, SIMCONNECT_GROUP_PRIORITY_HIGHEST);

      sstr = "";
      LVar = "";
      P[0] = '\0';
      ssstr[0] = '\0';
    }
    else {
      MaxLVars = LVarsRequestID - MIN_VAR_REQ_ID;
      break;
    }
  }
}

const std::string LVARS_FILEPATH = "\\work\\LVars.ini";

// Callbacks
void CALLBACK ProcessVars(SIMCONNECT_RECV* pData, DWORD cbData, void* pContext)
{
	switch (pData->dwID)
	{
	case SIMCONNECT_RECV_ID_CLIENT_DATA: {
		SIMCONNECT_RECV_CLIENT_DATA* pObjData = (SIMCONNECT_RECV_CLIENT_DATA*)pData;

		switch (pObjData->dwRequestID) {

		case REQ_CONTROL: {
			A32NX_Control* pS = (A32NX_Control*)&pObjData->dwData;

			set_named_variable_value(pS->id, pS->Parameter);
			Control = *pS;
			Version = pS->version;

			ExportData.Data = get_named_variable_value(Control.id);
			ExportData.id = Control.id;
			ExportData.version = Control.version;
			hr = SimConnect_SetClientData(hSimConnect, A32NX_LOCAL_DATA_ID, A32NX_LOCAL_DATA_DEFINITION, 0, 0, sizeof(ExportData), &ExportData);

			break;
		}
		default: {
			break;
		}
		}
		break;
	}
	case SIMCONNECT_RECV_ID_EVENT:
	{
		SIMCONNECT_RECV_EVENT* evt = (SIMCONNECT_RECV_EVENT*)pData;

		switch (evt->uEventID)
		{
		case EVENT_4SEC:
		{
			AddVars();
			break;
		}
    case SAVE_VARS: {
      INIStructure iniStructure;
      INIFile iniFile(LVARS_FILEPATH);
      for (int i = 0; i < MAX_IDS_VARS; i++) {
        LVar = get_name_of_named_variable(i);
        if (LVar[0] != '\0') {
          iniStructure["A32NX"]["VAR_" + std::to_string(i)] = LVar;
        }
        else {
          break;
        }
      }
      iniFile.write(iniStructure, true);

      break;
    }
		default:
		{
        ExportData.id = evt->uEventID - MIN_VAR_REQ_ID;
				ExportData.version = evt->dwData;
        ExportData.Data = get_named_variable_value(evt->uEventID - MIN_VAR_REQ_ID);
				hr = SimConnect_SetClientData(hSimConnect, A32NX_LOCAL_DATA_ID, A32NX_LOCAL_DATA_DEFINITION, 0, 0, sizeof(ExportData), &ExportData);
			break;
		}
		}
	}

	default:
	{
		break;
	}
	}

}

char* to_string1(PCSTRINGZ cs) {
	PSTRINGZ r;
	std::strcpy(r, cs);
	return r;
}



__attribute__((export_name("LVarsWrapper_gauge_callback"))) extern "C" bool LVarsWrapper_gauge_callback(FsContext ctx, int service_id, void* pData)
	{

		switch (service_id)
		{
		case PANEL_SERVICE_PRE_INSTALL: {
                    // execute_calculator_code()
                    sGaugeInstallData* p_install_data = (sGaugeInstallData*)pData;

                    if (hSimConnect == 0) {
                      if (0 <= (SimConnect_Open(&hSimConnect, "L:Vars wrapper", 0, 0, 0, 0))) {
                        {
                          VarNames.push_back("A32NX_RMP_L_TOGGLE_SWITCH");
                          VarNames.push_back("A32NX_RMP_R_TOGGLE_SWITCH");
                          VarNames.push_back("A32NX_RMP_L_SELECTED_MODE");
                          VarNames.push_back("A32NX_RMP_R_SELECTED_MODE");
                          VarNames.push_back("A32NX_RMP_L_VHF2_STANDBY_FREQUENCY");
                          VarNames.push_back("A32NX_RMP_L_VHF3_STANDBY_FREQUENCY");
                          VarNames.push_back("A32NX_RMP_R_VHF1_STANDBY_FREQUENCY");
                          VarNames.push_back("A32NX_RMP_R_VHF3_STANDBY_FREQUENCY");
                          VarNames.push_back("XMLVAR_ENG_MODE_SEL");
                          VarNames.push_back("LANDING_1_Retracted");
                          VarNames.push_back("LANDING_2_Retracted");
                          VarNames.push_back("XMLVAR_Baro1_Mode");
                          VarNames.push_back("XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position");
                          VarNames.push_back("XMLVAR_A320_WeatherRadar_Sys");
                          VarNames.push_back("A32NX_AVIONICS_STARTUP_SOUNDS_INHIBIT");
                          VarNames.push_back("A32NX_OVHD_ADIRS_IR_1_MODE_SELECTOR_KNOB");
                          VarNames.push_back("A32NX_OVHD_ADIRS_IR_2_MODE_SELECTOR_KNOB");
                          VarNames.push_back("A32NX_OVHD_ADIRS_IR_3_MODE_SELECTOR_KNOB");
                          VarNames.push_back("XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position");
                          VarNames.push_back("XMLVAR_SWITCH_OVHD_INTLT_EMEREXIT_Position");
                          VarNames.push_back("A32NX_OVHD_INTLT_ANN");
                          VarNames.push_back("XMLVAR_Auto");
                          VarNames.push_back("XMLVAR_ALT_MODE_REQUESTED");
                          VarNames.push_back("XMLVAR_A320_WEATHERRADAR_MODE");
                          VarNames.push_back("A320_Neo_AIRCOND_LVL_1");
                          VarNames.push_back("A320_Neo_AIRCOND_LVL_2");
                          VarNames.push_back("A320_Neo_AIRCOND_LVL_3");
                          VarNames.push_back("PUSH_OVHD_OXYGEN_CREW");
                          VarNames.push_back("STROBE_1_Auto");
                          VarNames.push_back("A32NX_BARO_BRIGHTNESS");
                          VarNames.push_back("A32NX_SWITCH_RADAR_PWS_Position");
                          VarNames.push_back("A32NX_COLD_AND_DARK_SPAWN");
                          VarNames.push_back("A32NX_ELEC_COMMERCIAL_FAULT");
                          VarNames.push_back("A32NX_ELEC_COMMERCIAL_TOGGLE");
                          VarNames.push_back("A32NX_ELEC_GALYCAB_FAULT");
                          VarNames.push_back("A32NX_ELEC_IDG1_FAULT");
                          VarNames.push_back("A32NX_ELEC_IDG2_FAULT");
                          VarNames.push_back("A32NX_ELEC_BUSTIE_TOGGLE");
                          VarNames.push_back("A32NX_ELEC_ACESSFEED_FAULT");
                          VarNames.push_back("A32NX_ELEC_ACESSFEED_TOGGLE");
                          VarNames.push_back("A32NX_ELEC_IDG1LOCK_TOGGLE");
                          VarNames.push_back("A32NX_ELEC_IDG2LOCK_TOGGLE");
                          VarNames.push_back("A32NX_ELEC_GALYCAB_TOGGLE");
                          VarNames.push_back("A32NX_KNOB_OVHD_AIRCOND_XBLEED_Position");
                          VarNames.push_back("A32NX_KNOB_OVHD_AIRCOND_PACKFLOW_Position");
                          VarNames.push_back("A320_Neo_MFD_Range_1");
                          VarNames.push_back("A320_Neo_MFD_Range_2");
                          VarNames.push_back("A320_Neo_MFD_NAV_MODE_1");
                          VarNames.push_back("A320_Neo_MFD_NAV_MODE_2");
                          VarNames.push_back("A32NX_AIRCOND_PACK1_FAULT");
                          VarNames.push_back("A32NX_OVHD_COND_PACK_1_PB_IS_ON");
                          VarNames.push_back("A32NX_AIRCOND_PACK2_FAULT");
                          VarNames.push_back("A32NX_OVHD_COND_PACK_2_PB_IS_ON");
                          VarNames.push_back("A32NX_AIRCOND_HOTAIR_FAULT");
                          VarNames.push_back("A32NX_AIRCOND_HOTAIR_TOGGLE");
                          VarNames.push_back("A32NX_AIRCOND_RAMAIRLOCK_TOGGLE");
                          VarNames.push_back("A32NX_AIRCOND_RAMAIR_TOGGLE");
                          VarNames.push_back("A32NX_CALLS_EMERLOCK_TOGGLE");
                          VarNames.push_back("A32NX_CALLS_EMER_ON");
                          VarNames.push_back("A32NX_OVHD_COCKPITDOORVIDEO_TOGGLE");
                          VarNames.push_back("A32NX_HYD_ENG1PUMP_FAULT");
                          VarNames.push_back("A32NX_HYD_ENG1PUMP_TOGGLE");
                          VarNames.push_back("A32NX_HYD_ENG2PUMP_FAULT");
                          VarNames.push_back("A32NX_HYD_ENG2PUMP_TOGGLE");
                          VarNames.push_back("A32NX_HYD_ELECPUMP_FAULT");
                          VarNames.push_back("A32NX_HYD_ELECPUMP_TOGGLE");
                          VarNames.push_back("A32NX_HYD_ELECPUMPLOCK_TOGGLE");
                          VarNames.push_back("A32NX_HYD_PTU_FAULT");
                          VarNames.push_back("A32NX_HYD_PTU_TOGGLE");
                          VarNames.push_back("A32NX_HYD_ELECPUMPY_FAULT");
                          VarNames.push_back("A32NX_HYD_ELECPUMPY_TOGGLE");
                          VarNames.push_back("A32NX_ENGMANSTART1LOCK_TOGGLE");
                          VarNames.push_back("A32NX_ENGMANSTART2LOCK_TOGGLE");
                          VarNames.push_back("A32NX_ENGMANSTART1_TOGGLE");
                          VarNames.push_back("A32NX_ENGMANSTART2_TOGGLE");
                          VarNames.push_back("A32NX_VENTILATION_BLOWER_FAULT");
                          VarNames.push_back("A32NX_VENTILATION_BLOWER_TOGGLE");
                          VarNames.push_back("A32NX_VENTILATION_EXTRACT_FAULT");
                          VarNames.push_back("A32NX_VENTILATION_EXTRACT_TOGGLE");
                          VarNames.push_back("A32NX_VENTILATION_CABFANS_TOGGLE");
                          VarNames.push_back("A32NX_EMERELECPWR_EMERTESTLOCK_TOGGLE");
                          VarNames.push_back("A32NX_OVHD_EMER_ELEC_GEN_1_LINE_PB_IS_ON");
                          VarNames.push_back("A32NX_EMERELECPWR_MANONLOCK_TOGGLE");
                          VarNames.push_back("A32NX_EVAC_COMMANDLOCK_TOGGLE");
                          VarNames.push_back("A32NX_EVAC_COMMAND_FAULT");
                          VarNames.push_back("A32NX_EVAC_COMMAND_TOGGLE");
                          VarNames.push_back("A32NX_EVAC_CAPT_TOGGLE");
                          VarNames.push_back("A32NX_CARGOSMOKE_DISCH1LOCK_TOGGLE");
                          VarNames.push_back("A32NX_CARGOSMOKE_DISCH2LOCK_TOGGLE");
                          VarNames.push_back("A32NX_KNOB_SWITCHING_1_Position");
                          VarNames.push_back("A32NX_KNOB_SWITCHING_2_Position");
                          VarNames.push_back("A32NX_KNOB_SWITCHING_3_Position");
                          VarNames.push_back("A32NX_KNOB_SWITCHING_4_Position");
                          VarNames.push_back("A32NX_PANEL_DCDU_L_BRIGHTNESS");
                          VarNames.push_back("A32NX_PANEL_DCDU_R_BRIGHTNESS");
                          VarNames.push_back("A32NX_OVHD_HYD_BLUEPUMP_OVRD");
                          VarNames.push_back("A32NX_OVHD_HYD_LEAK_MEASUREMENT_G");
                          VarNames.push_back("A32NX_OVHD_HYD_LEAK_MEASUREMENT_B");
                          VarNames.push_back("A32NX_OVHD_HYD_LEAK_MEASUREMENT_Y");
                          VarNames.push_back("A32NX_SWITCH_TCAS_TRAFFIC_POSITION");
                          VarNames.push_back("A32NX_CRANK_PHASE_SKIPPED");
                          VarNames.push_back("A32NX_AUTOBRAKES_ARMED_MODE");
                          VarNames.push_back("A32NX_PARK_BRAKE_LEVER_POS");
                          VarNames.push_back("A32NX_PAGE_ID");
                          VarNames.push_back("A32NX_PAGES_PRINTED");
                          VarNames.push_back("A32NX_PRINT_PAGE_OFFSET");
                          VarNames.push_back("A32NX_DISCARD_PAGE");
                          VarNames.push_back("AIRLINER_DECISION_HEIGHT");
                          VarNames.push_back("AIRLINER_MINIMUM_DESCENT_ALTITUDE");
                          VarNames.push_back("A32NX_FWC_FLIGHT_PHASE");
                          VarNames.push_back("A32NX_SPEEDS_VMAX");
                          VarNames.push_back("A32NX_SPEEDS_VLS");
                          VarNames.push_back("A32NX_FMA_VERTICAL_ARMED");
                          VarNames.push_back("A32NX_FMA_VERTICAL_MODE");
                          VarNames.push_back("XMLVAR_AirSpeedIsInMach");
                          VarNames.push_back("A32NX_SPEEDS_MANAGED_PFD");
                          VarNames.push_back("A320_FCU_SHOW_SELECTED_HEADING");
                          VarNames.push_back("A32NX_ELEC_AC_ESS_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_DC_ESS_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_DC_HOT_1_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_DC_2_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_BAT_1_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_BAT_2_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_AC_2_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_EFB_TURNED_ON");
                          VarNames.push_back("A32NX_SOUND_PTU_AUDIBLE_COCKPIT");
                          VarNames.push_back("A32NX_SOUND_EXTERIOR_MASTER");
                          VarNames.push_back("A32NX_SOUND_INTERIOR_ENGINE");
                          VarNames.push_back("A32NX_SOUND_INTERIOR_WIND");
                          VarNames.push_back("A32NX_REFUEL_RATE_SETTING");
                          VarNames.push_back("A32NX_CONFIG_USING_METRIC_UNIT");
                          VarNames.push_back("A32NX_EFB_BRIGHTNESS");
                          VarNames.push_back("A32NX_LEFT_BRAKE_PEDAL_INPUT");
                          VarNames.push_back("A32NX_RIGHT_BRAKE_PEDAL_INPUT");
                          VarNames.push_back("A32NX_OVHD_AUTOBRK_LOW_ON_IS_PRESSED");
                          VarNames.push_back("A32NX_OVHD_AUTOBRK_MED_ON_IS_PRESSED");
                          VarNames.push_back("A32NX_OVHD_AUTOBRK_MAX_ON_IS_PRESSED");
                          VarNames.push_back("A32NX_CONFIG_ADIRS_IR_ALIGN_TIME");
                          VarNames.push_back("A32NX_FIRE_BUTTON_APU");
                          VarNames.push_back("A32NX_OVHD_APU_MASTER_SW_PB_IS_ON");
                          VarNames.push_back("A32NX_OVHD_APU_MASTER_SW_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_APU_START_PB_IS_ON");
                          VarNames.push_back("A32NX_OVHD_APU_START_PB_IS_AVAILABLE");
                          VarNames.push_back("A32NX_OVHD_ELEC_BAT_1_PB_IS_AUTO");
                          VarNames.push_back("A32NX_OVHD_ELEC_BAT_1_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ELEC_BAT_2_PB_IS_AUTO");
                          VarNames.push_back("A32NX_OVHD_ELEC_BAT_2_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ELEC_IDG_1_PB_IS_RELEASED");
                          VarNames.push_back("A32NX_OVHD_ELEC_IDG_1_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ELEC_IDG_2_PB_IS_RELEASED");
                          VarNames.push_back("A32NX_OVHD_ELEC_IDG_2_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ELEC_ENG_GEN_1_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ELEC_ENG_GEN_2_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ELEC_APU_GEN_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ELEC_BUS_TIE_PB_IS_AUTO");
                          VarNames.push_back("A32NX_OVHD_ELEC_BUS_TIE_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ELEC_AC_ESS_FEED_PB_IS_NORMAL");
                          VarNames.push_back("A32NX_OVHD_ELEC_AC_ESS_FEED_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ELEC_GALY_AND_CAB_PB_IS_AUTO");
                          VarNames.push_back("A32NX_OVHD_ELEC_GALY_AND_CAB_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ELEC_COMMERCIAL_PB_IS_ON");
                          VarNames.push_back("A32NX_OVHD_ELEC_COMMERCIAL_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_EMER_ELEC_GEN_1_LINE_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_EMER_ELEC_RAT_AND_EMER_GEN_IS_PRESSED");
                          VarNames.push_back("A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON");
                          VarNames.push_back("A32NX_OVHD_PNEU_APU_BLEED_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_ENGINE_N2:1");
                          VarNames.push_back("A32NX_ENGINE_N2:2");
                          VarNames.push_back("A32NX_FIRE_BUTTON_ENG1");
                          VarNames.push_back("A32NX_FIRE_BUTTON_ENG2");
                          VarNames.push_back("A32NX_SPOILERS_GROUND_SPOILERS_ACTIVE");
                          VarNames.push_back("A32NX_OVHD_HYD_ENG_1_PUMP_PB_IS_AUTO");
                          VarNames.push_back("A32NX_OVHD_HYD_ENG_1_PUMP_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_HYD_ENG_2_PUMP_PB_IS_AUTO");
                          VarNames.push_back("A32NX_OVHD_HYD_ENG_2_PUMP_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_HYD_EPUMPB_PB_IS_AUTO");
                          VarNames.push_back("A32NX_OVHD_HYD_EPUMPB_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_HYD_PTU_PB_IS_AUTO");
                          VarNames.push_back("A32NX_OVHD_HYD_PTU_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_HYD_RAT_MAN_ON_IS_PRESSED");
                          VarNames.push_back("A32NX_OVHD_HYD_EPUMPY_PB_IS_AUTO");
                          VarNames.push_back("A32NX_OVHD_HYD_EPUMPY_PB_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_HYD_EPUMPY_OVRD_IS_PRESSED");
                          VarNames.push_back("A32NX_OVHD_ADIRS_IR_1_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ADIRS_IR_2_HAS_FAULT");
                          VarNames.push_back("A32NX_OVHD_ADIRS_IR_3_HAS_FAULT");
                          VarNames.push_back("A32NX_ADIRS_STATE");
                          VarNames.push_back("A32NX_ADIRS_TIME");
                          VarNames.push_back("A32NX_ADIRS_PFD_ALIGNED_FIRST");
                          VarNames.push_back("A32NX_ADIRS_PFD_ALIGNED_ATT");
                          VarNames.push_back("A32NX_OVHD_ADIRS_ON_BAT_IS_ILLUMINATED");
                          VarNames.push_back("A32NX_ELEC_APU_GEN_1_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_APU_GEN_1_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_APU_GEN_1_FREQUENCY");
                          VarNames.push_back("A32NX_ELEC_APU_GEN_1_FREQUENCY_NORMAL");
                          VarNames.push_back("A32NX_ELEC_APU_GEN_1_LOAD");
                          VarNames.push_back("A32NX_ELEC_APU_GEN_1_LOAD_NORMAL");
                          VarNames.push_back("A32NX_APU_N");
                          VarNames.push_back("A32NX_APU_EGT");
                          VarNames.push_back("A32NX_APU_EGT_CAUTION");
                          VarNames.push_back("A32NX_APU_EGT_WARNING");
                          VarNames.push_back("A32NX_APU_LOW_FUEL_PRESSURE_FAULT");
                          VarNames.push_back("A32NX_APU_FLAP_FULLY_OPEN");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_APU");
                          VarNames.push_back("A32NX_APU_IS_AUTO_SHUTDOWN");
                          VarNames.push_back("A32NX_APU_IS_EMERGENCY_SHUTDOWN");
                          VarNames.push_back("A32NX_APU_FLAP_OPEN_PERCENTAGE");
                          VarNames.push_back("A32NX_APU_BLEED_AIR_VALVE_OPEN");
                          VarNames.push_back("A32NX_OVHD_ELEC_ENG_GEN_1_PB_IS_ON");
                          VarNames.push_back("A32NX_OVHD_ELEC_ENG_GEN_2_PB_IS_ON");
                          VarNames.push_back("A32NX_OVHD_ELEC_APU_GEN_PB_IS_ON");
                          VarNames.push_back("A32NX_OVHD_ELEC_EXT_PWR_PB_IS_ON");
                          VarNames.push_back("A32NX_OVHD_ELEC_EXT_PWR_PB_IS_AVAILABLE");
                          VarNames.push_back("A32NX_OVHD_EMER_ELEC_RAT_AND_EMER_GEN_HAS_FAULT");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_1_IDG_IS_CONNECTED");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_1_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_1_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_1_FREQUENCY");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_1_FREQUENCY_NORMAL");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_1_LOAD");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_1_LOAD_NORMAL");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_2_IDG_OIL_OUTLET_TEMPERATURE");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_2_IDG_IS_CONNECTED");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_2_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_2_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_2_FREQUENCY");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_2_FREQUENCY_NORMAL");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_2_LOAD");
                          VarNames.push_back("A32NX_ELEC_ENG_GEN_2_LOAD_NORMAL");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_9XU1_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_9XU2_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_11XU1_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_11XU2_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_3XS_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_3XG_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_3XC1_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_3XC2_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_TR_1_CURRENT");
                          VarNames.push_back("A32NX_ELEC_TR_1_CURRENT_NORMAL");
                          VarNames.push_back("A32NX_ELEC_TR_1_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_TR_1_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_TR_2_CURRENT");
                          VarNames.push_back("A32NX_ELEC_TR_2_CURRENT_NORMAL");
                          VarNames.push_back("A32NX_ELEC_TR_2_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_TR_2_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_14PU_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_TR_3_CURRENT");
                          VarNames.push_back("A32NX_ELEC_TR_3_CURRENT_NORMAL");
                          VarNames.push_back("A32NX_ELEC_TR_3_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_TR_3_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_8XH_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_15XE1_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_2XE_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_15XE2_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_AC_1_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_AC_STAT_INV_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_AC_GND_FLT_SVC_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_12XN_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_BAT_1_CURRENT");
                          VarNames.push_back("A32NX_ELEC_BAT_1_CURRENT_NORMAL");
                          VarNames.push_back("A32NX_ELEC_BAT_1_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_6PB1_SHOW_ARROW_WHEN_CLOSED");
                          VarNames.push_back("A32NX_ELEC_BAT_2_CURRENT");
                          VarNames.push_back("A32NX_ELEC_BAT_2_CURRENT_NORMAL");
                          VarNames.push_back("A32NX_ELEC_BAT_2_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_6PB2_SHOW_ARROW_WHEN_CLOSED");
                          VarNames.push_back("A32NX_ELEC_STAT_INV_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_STAT_INV_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_STAT_INV_FREQUENCY");
                          VarNames.push_back("A32NX_ELEC_STAT_INV_FREQUENCY_NORMAL");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_1PC1_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_1PC2_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_4PC_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_8PH_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_6PB1_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_6PB2_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_2XB2_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_2XB1_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_5PU1_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_5PU2_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_3PE_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_DC_1_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_DC_BAT_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_DC_BAT_BUS_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_DC_ESS_SHED_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_DC_HOT_2_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_10KA_AND_5KA_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_DC_GND_FLT_SVC_BUS_IS_POWERED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_3PX_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_CONTACTOR_8PN_IS_CLOSED");
                          VarNames.push_back("A32NX_ELEC_EMER_GEN_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_EMER_GEN_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_EMER_GEN_FREQUENCY");
                          VarNames.push_back("A32NX_ELEC_EMER_GEN_FREQUENCY_NORMAL");
                          VarNames.push_back("A32NX_ELEC_GALLEY_IS_SHED");
                          VarNames.push_back("A32NX_ELEC_EXT_PWR_POTENTIAL");
                          VarNames.push_back("A32NX_ELEC_EXT_PWR_POTENTIAL_NORMAL");
                          VarNames.push_back("A32NX_ELEC_EXT_PWR_FREQUENCY");
                          VarNames.push_back("A32NX_ELEC_EXT_PWR_FREQUENCY_NORMAL");
                          VarNames.push_back("A32NX_HYD_GREEN_EDPUMP_ACTIVE");
                          VarNames.push_back("A32NX_HYD_GREEN_EDPUMP_LOW_PRESS");
                          VarNames.push_back("A32NX_HYD_YELLOW_EDPUMP_ACTIVE");
                          VarNames.push_back("A32NX_HYD_YELLOW_EDPUMP_LOW_PRESS");
                          VarNames.push_back("A32NX_HYD_BLUE_EPUMP_ACTIVE");
                          VarNames.push_back("A32NX_HYD_BLUE_EPUMP_LOW_PRESS");
                          VarNames.push_back("A32NX_HYD_YELLOW_EPUMP_ACTIVE");
                          VarNames.push_back("A32NX_HYD_YELLOW_EPUMP_LOW_PRESS");
                          VarNames.push_back("A32NX_HYD_RAT_RPM");
                          VarNames.push_back("A32NX_HYD_RAT_STOW_POSITION");
                          VarNames.push_back("A32NX_HYD_PTU_ACTIVE_L2R");
                          VarNames.push_back("A32NX_HYD_PTU_ACTIVE_R2L");
                          VarNames.push_back("A32NX_HYD_PTU_MOTOR_FLOW");
                          VarNames.push_back("A32NX_HYD_PTU_VALVE_OPENED");
                          VarNames.push_back("A32NX_HYD_BLUE_PRESSURE");
                          VarNames.push_back("A32NX_HYD_BLUE_RESERVOIR");
                          VarNames.push_back("A32NX_HYD_GREEN_PRESSURE");
                          VarNames.push_back("A32NX_HYD_GREEN_RESERVOIR");
                          VarNames.push_back("A32NX_HYD_GREEN_FIRE_VALVE_OPENED");
                          VarNames.push_back("A32NX_HYD_YELLOW_PRESSURE");
                          VarNames.push_back("A32NX_HYD_YELLOW_RESERVOIR");
                          VarNames.push_back("A32NX_HYD_YELLOW_FIRE_VALVE_OPENED");
                          VarNames.push_back("A32NX_AUTOBRAKES_DECEL_LIGHT");
                          VarNames.push_back("A32NX_HYD_BRAKE_NORM_LEFT_PRESS");
                          VarNames.push_back("A32NX_HYD_BRAKE_NORM_RIGHT_PRESS");
                          VarNames.push_back("A32NX_HYD_BRAKE_ALTN_LEFT_PRESS");
                          VarNames.push_back("A32NX_HYD_BRAKE_ALTN_RIGHT_PRESS");
                          VarNames.push_back("A32NX_HYD_BRAKE_ALTN_ACC_PRESS");
                          VarNames.push_back("A32NX_OVHD_HYD_EPUMPY_OVRD_IS_ON");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_INPUT:1");
                          VarNames.push_back("A32NX_AUTOTHRUST_TLA:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_USE_REVERSE_ON_AXIS:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_REVERSE_LOW:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_REVERSE_HIGH:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_REVERSE_IDLE_LOW:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_REVERSE_IDLE_HIGH:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_IDLE_LOW:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_IDLE_HIGH:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_CLIMB_LOW:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_CLIMB_HIGH:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_FLEXMCT_LOW:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_FLEXMCT_HIGH:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_TOGA_LOW:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_TOGA_HIGH:1");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_INPUT:2");
                          VarNames.push_back("A32NX_AUTOTHRUST_TLA:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_USE_REVERSE_ON_AXIS:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_REVERSE_LOW:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_REVERSE_HIGH:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_REVERSE_IDLE_LOW:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_REVERSE_IDLE_HIGH:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_IDLE_LOW:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_IDLE_HIGH:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_CLIMB_LOW:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_CLIMB_HIGH:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_FLEXMCT_LOW:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_FLEXMCT_HIGH:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_TOGA_LOW:2");
                          VarNames.push_back("A32NX_THROTTLE_MAPPING_TOGA_HIGH:2");
                          VarNames.push_back("A32NX_PERFORMANCE_WARNING_ACTIVE");
                          VarNames.push_back("A32NX_EXTERNAL_OVERRIDE");
                          VarNames.push_back("A32NX_DFDR_EVENT_ON");
                          VarNames.push_back("A32NX_SIDESTICK_POSITION_X");
                          VarNames.push_back("A32NX_SIDESTICK_POSITION_Y");
                          VarNames.push_back("A32NX_RUDDER_PEDAL_POSITION");
                          VarNames.push_back("A32NX_FMA_LATERAL_MODE");
                          VarNames.push_back("A32NX_FMA_LATERAL_ARMED");
                          VarNames.push_back("A32NX_FMA_EXPEDITE_MODE");
                          VarNames.push_back("A32NX_FMA_SPEED_PROTECTION_MODE");
                          VarNames.push_back("A32NX_FMA_SOFT_ALT_MODE");
                          VarNames.push_back("A32NX_FMA_CRUISE_ALT_MODE");
                          VarNames.push_back("A32NX_ApproachCapability");
                          VarNames.push_back("A32NX_FMA_TRIPLE_CLICK");
                          VarNames.push_back("A32NX_FMA_MODE_REVERSION");
                          VarNames.push_back("A32NX_FLIGHT_DIRECTOR_BANK");
                          VarNames.push_back("A32NX_FLIGHT_DIRECTOR_PITCH");
                          VarNames.push_back("A32NX_FLIGHT_DIRECTOR_YAW");
                          VarNames.push_back("A32NX_AUTOPILOT_AUTOLAND_WARNING");
                          VarNames.push_back("A32NX_AUTOPILOT_ACTIVE");
                          VarNames.push_back("A32NX_AUTOPILOT_1_ACTIVE");
                          VarNames.push_back("A32NX_AUTOPILOT_2_ACTIVE");
                          VarNames.push_back("A32NX_AUTOPILOT_AUTOTHRUST_MODE");
                          VarNames.push_back("A32NX_SPEEDS_ALPHA_PROTECTION");
                          VarNames.push_back("A32NX_SPEEDS_ALPHA_MAX");
                          VarNames.push_back("A32NX_ALPHA_MAX_PERCENTAGE");
                          VarNames.push_back("A32NX_FMGC_FLIGHT_PHASE");
                          VarNames.push_back("AIRLINER_V2_SPEED");
                          VarNames.push_back("AIRLINER_VAPP_SPEED");
                          VarNames.push_back("A32NX_AP_CSTN_ALT");
                          VarNames.push_back("AIRLINER_THR_RED_ALT");
                          VarNames.push_back("AIRLINER_THR_RED_ALT_GOAROUND");
                          VarNames.push_back("AIRLINER_ACC_ALT");
                          VarNames.push_back("A32NX_ENG_OUT_ACC_ALT");
                          VarNames.push_back("AIRLINER_ACC_ALT_GOAROUND");
                          VarNames.push_back("AIRLINER_ENG_OUT_ACC_ALT_GOAROUND");
                          VarNames.push_back("AIRLINER_CRUISE_ALTITUDE");
                          VarNames.push_back("AIRLINER_TO_FLEX_TEMP");
                          VarNames.push_back("A32NX_FG_AVAIL");
                          VarNames.push_back("A32NX_FG_CROSS_TRACK_ERROR");
                          VarNames.push_back("A32NX_FG_TRACK_ANGLE_ERROR");
                          VarNames.push_back("A32NX_FG_PHI_COMMAND");
                          VarNames.push_back("A32NX_TRK_FPA_MODE_ACTIVE");
                          VarNames.push_back("A32NX_AUTOPILOT_FPA_SELECTED");
                          VarNames.push_back("A32NX_AUTOPILOT_VS_SELECTED");
                          VarNames.push_back("A32NX_AUTOPILOT_HEADING_SELECTED");
                          VarNames.push_back("A32NX_FCU_LOC_MODE_ACTIVE");
                          VarNames.push_back("A32NX_FCU_APPR_MODE_ACTIVE");
                          VarNames.push_back("A32NX_FCU_MODE_REVERSION_ACTIVE");
                          VarNames.push_back("A32NX_FCU_MODE_REVERSION_TRK_FPA_ACTIVE");
                          VarNames.push_back("A32NX_3D_THROTTLE_LEVER_POSITION_1");
                          VarNames.push_back("A32NX_3D_THROTTLE_LEVER_POSITION_2");
                          VarNames.push_back("A32NX_AUTOTHRUST_STATUS");
                          VarNames.push_back("A32NX_AUTOTHRUST_MODE");
                          VarNames.push_back("A32NX_AUTOTHRUST_MODE_MESSAGE");
                          VarNames.push_back("A32NX_AUTOTHRUST_THRUST_LEVER_WARNING_FLEX");
                          VarNames.push_back("A32NX_AUTOTHRUST_THRUST_LEVER_WARNING_TOGA");
                          VarNames.push_back("A32NX_AUTOTHRUST_DISCONNECT");
                          VarNames.push_back("A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE");
                          VarNames.push_back("A32NX_AUTOTHRUST_THRUST_LIMIT");
                          VarNames.push_back("A32NX_AUTOTHRUST_TLA_N1:1");
                          VarNames.push_back("A32NX_AUTOTHRUST_TLA_N1:2");
                          VarNames.push_back("A32NX_AUTOTHRUST_REVERSE:1");
                          VarNames.push_back("A32NX_AUTOTHRUST_REVERSE:2");
                          VarNames.push_back("A32NX_AUTOTHRUST_N1_COMMANDED:1");
                          VarNames.push_back("A32NX_AUTOTHRUST_N1_COMMANDED:2");
                          VarNames.push_back("A32NX_ENGINE_N1:1");
                          VarNames.push_back("A32NX_ENGINE_N1:2");
                          VarNames.push_back("A32NX_ENGINE_IDLE_N1");
                          VarNames.push_back("A32NX_ENGINE_IDLE_N2");
                          VarNames.push_back("A32NX_ENGINE_IDLE_FF");
                          VarNames.push_back("A32NX_ENGINE_IDLE_EGT");
                          VarNames.push_back("A32NX_ENGINE_EGT:1");
                          VarNames.push_back("A32NX_ENGINE_EGT:2");
                          VarNames.push_back("A32NX_ENGINE_TANK_OIL:1");
                          VarNames.push_back("A32NX_ENGINE_TANK_OIL:2");
                          VarNames.push_back("A32NX_ENGINE_TOTAL_OIL:1");
                          VarNames.push_back("A32NX_ENGINE_TOTAL_OIL:2");
                          VarNames.push_back("A32NX_ENGINE_FF:1");
                          VarNames.push_back("A32NX_ENGINE_FF:2");
                          VarNames.push_back("A32NX_ENGINE_PRE_FF:1");
                          VarNames.push_back("A32NX_ENGINE_PRE_FF:2");
                          VarNames.push_back("A32NX_ENGINE_IMBALANCE");
                          VarNames.push_back("A32NX_FUEL_USED:1");
                          VarNames.push_back("A32NX_FUEL_USED:2");
                          VarNames.push_back("A32NX_FUEL_LEFT_PRE");
                          VarNames.push_back("A32NX_FUEL_RIGHT_PRE");
                          VarNames.push_back("A32NX_FUEL_AUX_LEFT_PRE");
                          VarNames.push_back("A32NX_FUEL_AUX_RIGHT_PRE");
                          VarNames.push_back("A32NX_FUEL_CENTER_PRE");
                          VarNames.push_back("A32NX_ENGINE_CYCLE_TIME");
                          VarNames.push_back("A32NX_ENGINE_STATE:1");
                          VarNames.push_back("A32NX_ENGINE_STATE:2");
                          VarNames.push_back("A32NX_ENGINE_TIMER:1");
                          VarNames.push_back("A32NX_ENGINE_TIMER:2");
                          VarNames.push_back("A32NX_FLAPS_HANDLE_INDEX");
                          VarNames.push_back("A32NX_FLAPS_HANDLE_PERCENT");
                          VarNames.push_back("A32NX_SPOILERS_ARMED");
                          VarNames.push_back("A32NX_SPOILERS_HANDLE_POSITION");
                          VarNames.push_back("A32NX_3D_AILERON_LEFT_DEFLECTION");
                          VarNames.push_back("A32NX_3D_AILERON_RIGHT_DEFLECTION");
                          VarNames.push_back("A320_Neo_FCU_SPEED_SET_DATA");
                          VarNames.push_back("A320_Neo_FCU_HDG_SET_DATA");
                          VarNames.push_back("A320_Neo_FCU_VS_SET_DATA");
                          VarNames.push_back("Glasscockpits_FPLHaveOrigin");
                          VarNames.push_back("Glasscockpits_FPLHaveDestination");
                          VarNames.push_back("A32NX_MCDU_L_BRIGHTNESS");
                          VarNames.push_back("A32NX_MCDU_R_BRIGHTNESS");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_L1");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_L2");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_L3");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_L4");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_L5");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_L6");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_R1");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_R2");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_R3");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_R4");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_R5");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_R6");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_DIR");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_PROG");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_PERF");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_INIT");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_DATA");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_FPLN");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_RAD");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_FUEL");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_SEC");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_ATC");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_MENU");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_AIRPORT");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_DARROW");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_UARROW");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_LARROW");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_RARROW");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_0");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_1");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_2");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_3");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_4");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_5");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_6");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_7");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_8");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_9");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_A");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_B");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_C");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_D");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_E");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_F");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_G");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_H");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_I");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_J");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_K");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_L");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_M");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_N");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_O");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_P");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_Q");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_R");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_S");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_T");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_U");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_V");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_W");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_X");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_Y");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_Z");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_DOT");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_PLUSMINUS");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_SP");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_SLASH");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_OVFY");
                          VarNames.push_back("A32NX_MCDU_CLR_Pressed");
                          VarNames.push_back("A32NX_MCDU_CLR_MinReleaseTime");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_1_CLR");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_L1");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_L2");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_L3");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_L4");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_L5");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_L6");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_R1");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_R2");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_R3");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_R4");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_R5");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_R6");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_DIR");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_PROG");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_PERF");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_INIT");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_DATA");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_FPLN");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_RAD");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_FUEL");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_SEC");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_ATC");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_MENU");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_AIRPORT");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_DARROW");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_UARROW");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_LARROW");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_RARROW");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_0");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_1");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_2");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_3");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_4");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_5");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_6");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_7");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_8");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_9");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_A");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_B");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_C");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_D");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_E");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_F");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_G");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_H");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_I");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_J");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_K");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_L");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_M");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_N");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_O");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_P");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_Q");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_R");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_S");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_T");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_U");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_V");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_W");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_X");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_Y");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_Z");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_DOT");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_PLUSMINUS");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_SP");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_SLASH");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_OVFY");
                          VarNames.push_back("A32NX_MCDU_PUSH_ANIM_2_CLR");
                          VarNames.push_back("XMLVAR_Throttle1Position");
                          VarNames.push_back("XMLVAR_Throttle2Position");
                          VarNames.push_back("XMLVAR_PTU_ON");
                          VarNames.push_back("XMLVAR_RudderTrim");
                          VarNames.push_back("XMLVAR_LeverFlapsHidden");
                          VarNames.push_back("A32NX_PRIORITY_TAKEOVER:1");
                          VarNames.push_back("A32NX_PRIORITY_TAKEOVER:2");
                          VarNames.push_back("A32NX_GPWS_TEST");
                          VarNames.push_back("A32NX_GPWS_Warning_Active");
                          VarNames.push_back("A32NX_GPWS_GS_Warning_Active");
                          VarNames.push_back("BTN_TERRONND_1_ACTIVE");
                          VarNames.push_back("BTN_TERRONND_2_ACTIVE");
                          VarNames.push_back("A32NX_PRINTER_PRINTING");
                          VarNames.push_back("A32NX_BRAKE_FAN_BTN_PRESSED");
                          VarNames.push_back("A32NX_BRAKES_HOT");
                          VarNames.push_back("A32NX_BRAKE_FAN");
                          VarNames.push_back("XMLVAR_Autobrakes_Level");
                          VarNames.push_back("A32NX_BARO_BUGS_ACTIVE");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_ELEC_BAT1_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_ELEC_BAT2_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_ELEC_GEN1_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_ELEC_GEN2_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_ELEC_APUGEN_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_AIRCOND_ENG1BLEED_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_AIRCOND_ENG2BLEED_Pressed");
                          VarNames.push_back("A32NX_STBY_COMPASS_LIGHT_TOGGLE");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FUEL_XFEED_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FUEL_LTKPUMPS1_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FUEL_LTKPUMPS2_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FUEL_PUMP1_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FUEL_PUMP2_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FUEL_RTKPUMPS1_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FUEL_RTKPUMPS2_Pressed");
                          VarNames.push_back("A32NX_FBW_ELAC_SWITCH:1");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FLTCTL_ELAC_Pressed");
                          VarNames.push_back("A32NX_FBW_ELAC_FAILED:1");
                          VarNames.push_back("A32NX_FBW_SEC_SWITCH:1");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FLTCTL_SEC_Pressed");
                          VarNames.push_back("A32NX_FBW_SEC_FAILED:1");
                          VarNames.push_back("A32NX_FBW_FAC_SWITCH:1");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FLTCTL_FAC_Pressed");
                          VarNames.push_back("A32NX_FBW_FAC_FAILED:1");
                          VarNames.push_back("A32NX_ELT_TEST_RESET");
                          VarNames.push_back("A32NX_ELT_ON");
                          VarNames.push_back("A32NX_CABIN_READY");
                          VarNames.push_back("A32NX_TO_CONFIG_NORMAL");
                          VarNames.push_back("PUSH_DOORPANEL_VIDEO");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_EVAC_COMMAND_Pressed");
                          VarNames.push_back("PUSH_OVHD_EVAC_HORN");
                          VarNames.push_back("A32NX_EMERELECPWR_GEN_TEST");
                          VarNames.push_back("A32NX_OVHD_HYD_EPUMPB_PB_IS_AUTO_LOCK");
                          VarNames.push_back("A32NX_AIRCOND_RAMAIR_TOGGLE_LOCK");
                          VarNames.push_back("A32NX_CREW_HEAD_SET");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OXYGEN_TWRRESET_Pressed");
                          VarNames.push_back("A32NX_OXYGEN_TMR_RESET");
                          VarNames.push_back("A32NX_OXYGEN_MASKS_DEPLOYED");
                          VarNames.push_back("A32NX_OXYGEN_PASSENGER_LIGHT_ON");
                          VarNames.push_back("A32NX_OXYGEN_TMR_RESET_FAULT");
                          VarNames.push_back("A32NX_SVGEINT_OVRD_ON");
                          VarNames.push_back("A32NX_AVIONICS_COMPLT_ON");
                          VarNames.push_back("A32NX_FBW_ELAC_SWITCH:2");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FLTCTL_ELAC2_Pressed");
                          VarNames.push_back("A32NX_FBW_ELAC_FAILED:2");
                          VarNames.push_back("A32NX_FBW_SEC_SWITCH:2");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FLTCTL_SEC2_Pressed");
                          VarNames.push_back("A32NX_FBW_SEC_FAILED:2");
                          VarNames.push_back("A32NX_FBW_SEC_SWITCH:3");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FLTCTL_SEC3_Pressed");
                          VarNames.push_back("A32NX_FBW_SEC_FAILED:3");
                          VarNames.push_back("A32NX_FBW_FAC_SWITCH:2");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_FLTCTL_FAC2_Pressed");
                          VarNames.push_back("A32NX_FBW_FAC_FAILED:2");
                          VarNames.push_back("A32NX_ENGMANSTART1_TOGGLE_LOCK");
                          VarNames.push_back("A32NX_ENGMANSTART2_TOGGLE_LOCK");
                          VarNames.push_back("A32NX_MAN_PITOT_HEAT");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_ANTIICE_ENG1_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_ANTIICE_ENG2_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_ANTIICE_WING_Pressed");
                          VarNames.push_back("XMLVAR_Momentary_PUSH_OVHD_PROBESWINDOW_Pressed");
                          VarNames.push_back("A32NX_RAIN_REPELLENT_LEFT_ON");
                          VarNames.push_back("A32NX_RAIN_REPELLENT_RIGHT_ON");
                          VarNames.push_back("A32NX_FIRE_TEST_ENG1");
                          VarNames.push_back("A32NX_FIRE_ENG1_AGENT1_Discharge");
                          VarNames.push_back("A32NX_FIRE_ENG1_AGENT2_Discharge");
                          VarNames.push_back("A32NX_FIRE_GUARD_ENG1");
                          VarNames.push_back("A32NX_FIRE_TEST_ENG2");
                          VarNames.push_back("A32NX_FIRE_ENG2_AGENT1_Discharge");
                          VarNames.push_back("A32NX_FIRE_ENG2_AGENT2_Discharge");
                          VarNames.push_back("A32NX_FIRE_GUARD_ENG2");
                          VarNames.push_back("A32NX_FIRE_TEST_APU");
                          VarNames.push_back("A32NX_FIRE_APU_AGENT1_Discharge");
                          VarNames.push_back("A32NX_FIRE_GUARD_APU");
                          VarNames.push_back("A32NX_FIRE_TEST_CARGO");
                          VarNames.push_back("A32NX_CARGOSMOKE_AFT_DISCHARGED");
                          VarNames.push_back("A32NX_CARGOSMOKE_FWD_DISCHARGED");
                          VarNames.push_back("A32NX_GPWS_TERR_OFF");
                          VarNames.push_back("A32NX_GPWS_SYS_OFF");
                          VarNames.push_back("A32NX_GPWS_GS_OFF");
                          VarNames.push_back("A32NX_GPWS_FLAP_OFF");
                          VarNames.push_back("A32NX_GPWS_FLAPS3");
                          VarNames.push_back("A32NX_RCDR_GROUND_CONTROL_ON");
                          VarNames.push_back("A32NX_RCDR_TEST");
                          VarNames.push_back("PUSH_OVHD_CALLS_MECH");
                          VarNames.push_back("PUSH_OVHD_CALLS_ALL");
                          VarNames.push_back("PUSH_OVHD_CALLS_FWD");
                          VarNames.push_back("PUSH_OVHD_CALLS_AFT");
                          VarNames.push_back("A32NX_CALLS_EMER_ON_LOCK");
                          VarNames.push_back("A32NX_AIDS_PRINT_ON");
                          VarNames.push_back("A32NX_OVHD_HYD_LEAK_MEASUREMENT_G_LOCK");
                          VarNames.push_back("A32NX_OVHD_HYD_LEAK_MEASUREMENT_B_LOCK");
                          VarNames.push_back("A32NX_OVHD_HYD_LEAK_MEASUREMENT_Y_LOCK");
                          VarNames.push_back("A32NX_OVHD_FADEC_1_LOCK");
                          VarNames.push_back("A32NX_OVHD_FADEC_1");
                          VarNames.push_back("A32NX_OVHD_FADEC_2_LOCK");
                          VarNames.push_back("A32NX_OVHD_FADEC_2");
                          VarNames.push_back("A32NX_APU_AUTOEXITING_TEST_ON");
                          VarNames.push_back("A32NX_APU_AUTOEXITING_TEST_OK");
                          VarNames.push_back("A32NX_APU_AUTOEXITING_RESET");
                          VarNames.push_back("XMLVAR_KNOB_OVHD_CABINPRESS_LDGELEV");
                          VarNames.push_back("A32NX_LANDING_ELEVATION");
                          VarNames.push_back("A32NX_MAN_VS_CONTROL");
                          VarNames.push_back("A32NX_CAB_PRESS_MODE_MAN");
                          VarNames.push_back("A32NX_CAB_PRESS_SYS_FAULT");
                          VarNames.push_back("A32NX_DITCHING_LOCK");
                          VarNames.push_back("A32NX_DITCHING");
                          VarNames.push_back("XMLVAR_Autopilot_Altitude_Increment");
                          VarNames.push_back("XMLVAR_Baro_Selector_HPA_1");
                          VarNames.push_back("BTN_LS_1_FILTER_ACTIVE");
                          VarNames.push_back("BTN_LS_2_FILTER_ACTIVE");
                          VarNames.push_back("BTN_CSTR_1_FILTER_ACTIVE");
                          VarNames.push_back("BTN_VORD_1_FILTER_ACTIVE");
                          VarNames.push_back("BTN_WPT_1_FILTER_ACTIVE");
                          VarNames.push_back("BTN_NDB_1_FILTER_ACTIVE");
                          VarNames.push_back("BTN_ARPT_1_FILTER_ACTIVE");
                          VarNames.push_back("BTN_CSTR_2_FILTER_ACTIVE");
                          VarNames.push_back("BTN_VORD_2_FILTER_ACTIVE");
                          VarNames.push_back("BTN_WPT_2_FILTER_ACTIVE");
                          VarNames.push_back("BTN_NDB_2_FILTER_ACTIVE");
                          VarNames.push_back("BTN_ARPT_2_FILTER_ACTIVE");
                          VarNames.push_back("A32NX_METRIC_ALT_TOGGLE");
                          VarNames.push_back("XMLVAR_NAV_AID_SWITCH_L1_State");
                          VarNames.push_back("XMLVAR_NAV_AID_SWITCH_L2_State");
                          VarNames.push_back("XMLVAR_NAV_AID_SWITCH_R1_State");
                          VarNames.push_back("XMLVAR_NAV_AID_SWITCH_R2_State");
                          VarNames.push_back("A32NX_ECAM_SD_CURRENT_PAGE_INDEX");
                          VarNames.push_back("A32NX_ECAM_ALL_Push");
                          VarNames.push_back("A32NX_ECAM_ALL_Push_IsDown");
                          VarNames.push_back("A32NX_ECAM_ALL_Push_MinReleaseTime");
                          VarNames.push_back("A32NX_BTN_TOCONFIG");
                          VarNames.push_back("A32NX_BTN_EMERCANC");
                          VarNames.push_back("A32NX_BTN_CLR");
                          VarNames.push_back("A32NX_ECAM_SFAIL");
                          VarNames.push_back("A32NX_BTN_CLR2");
                          VarNames.push_back("A32NX_BTN_RCL");
                          VarNames.push_back("XMLVAR_COM_1_VHF_L_Switch_Down");
                          VarNames.push_back("XMLVAR_COM_2_VHF_L_Switch_Down");
                          VarNames.push_back("XMLVAR_COM_3_VHF_L_Switch_Down");
                          VarNames.push_back("XMLVAR_COM_1_VHF_C_Switch_Down");
                          VarNames.push_back("XMLVAR_COM_2_VHF_C_Switch_Down");
                          VarNames.push_back("XMLVAR_COM_3_VHF_C_Switch_Down");
                          VarNames.push_back("XMLVAR_COM_1_VHF_R_Switch_Down");
                          VarNames.push_back("XMLVAR_COM_2_VHF_R_Switch_Down");
                          VarNames.push_back("XMLVAR_COM_3_VHF_R_Switch_Down");
                          VarNames.push_back("XMLVAR_COM_1_Volume_VHF_L");
                          VarNames.push_back("XMLVAR_COM_2_Volume_VHF_L");
                          VarNames.push_back("XMLVAR_COM_3_Volume_VHF_L");
                          VarNames.push_back("XMLVAR_COM_1_Volume_VHF_C");
                          VarNames.push_back("XMLVAR_COM_2_Volume_VHF_C");
                          VarNames.push_back("XMLVAR_COM_3_Volume_VHF_C");
                          VarNames.push_back("XMLVAR_COM_1_Volume_VHF_R");
                          VarNames.push_back("XMLVAR_COM_2_Volume_VHF_R");
                          VarNames.push_back("XMLVAR_COM_3_Volume_VHF_R");
                          VarNames.push_back("XMLVAR_RMP_L_NavLockOff");
                          VarNames.push_back("XMLVAR_COM_Transmit_Channel");
                          VarNames.push_back("XMLVAR_RMP_R_NavLockOff");
                          VarNames.push_back("A32NX_SWITCH_ATC_ALT");
                          VarNames.push_back("A32NX_SWITCH_TCAS_Position");
                          VarNames.push_back("A32NX_MASTER_WARNING");
                          VarNames.push_back("PUSH_AUTOPILOT_MASTERAWARN_L");
                          VarNames.push_back("Generic_Master_Warning_Active");
                          VarNames.push_back("A32NX_MASTER_CAUTION");
                          VarNames.push_back("PUSH_AUTOPILOT_MASTERCAUT_L");
                          VarNames.push_back("Generic_Master_Caution_Active");
                          VarNames.push_back("PUSH_AUTOPILOT_MASTERAWARN_R");
                          VarNames.push_back("PUSH_AUTOPILOT_MASTERCAUT_R");
                          VarNames.push_back("A32NX_COCKPIT_DOOR_LOCKED");
                          VarNames.push_back("PUSH_AUTOPILOT_CHRONO_L");
                          VarNames.push_back("PUSH_AUTOPILOT_CHRONO_R");
                          VarNames.push_back("A32NX_CHRONO_ET_SWITCH_POS");
                          VarNames.push_back("A32NX_DCDU_ATC_MSG_ACK");
                          VarNames.push_back("A32NX_DCDU_ATC_MSG_WAITING");
                          VarNames.push_back("XMLVAR_COCKPIT_COFFEE_L_HIDDEN");
                          VarNames.push_back("XMLVAR_COCKPIT_COFFEE_R_HIDDEN");
                          VarNames.push_back("A32NX_CKPT_TRIM_TEMP");
                          VarNames.push_back("A32NX_CKPT_TEMP");
                          VarNames.push_back("A32NX_FWD_TRIM_TEMP");
                          VarNames.push_back("A32NX_FWD_TEMP");
                          VarNames.push_back("A32NX_AFT_TRIM_TEMP");
                          VarNames.push_back("A32NX_AFT_TEMP");
                          VarNames.push_back("A32NX_SLIDES_ARMED");
                          VarNames.push_back("A32NX_REPORTED_BRAKE_TEMPERATURE_1");
                          VarNames.push_back("A32NX_REPORTED_BRAKE_TEMPERATURE_2");
                          VarNames.push_back("A32NX_REPORTED_BRAKE_TEMPERATURE_3");
                          VarNames.push_back("A32NX_REPORTED_BRAKE_TEMPERATURE_4");
                          VarNames.push_back("A32NX_INITIAL_FLIGHT_PHASE");
                          VarNames.push_back("A32NX_OVHD_HYD_EPUMPY_OVRD_PB_IS_ON");
                          VarNames.push_back("A32NX_RADAR_MULTISCAN_AUTO");
                          VarNames.push_back("A32NX_RADAR_GCS_AUTO");
                          VarNames.push_back("A32NX_DLS_ON");
                          VarNames.push_back("XMLVAR_Autopilot_1_Status");
                          VarNames.push_back("XMLVAR_Autopilot_2_Status");
                          VarNames.push_back("A32NX_SPEEDS_GD");
                          VarNames.push_back("A32NX_SPEEDS_F");
                          VarNames.push_back("A32NX_SPEEDS_S");
                          VarNames.push_back("RADIONAV ACTIVE:1");
                          VarNames.push_back("A32NX_FWC_SKIP_STARTUP");
                          VarNames.push_back("A32NX_FLIGHT_PLAN_VERSION");
                          VarNames.push_back("GPSPrimaryAcknowledged");
                          VarNames.push_back("GPSPrimary");
                          VarNames.push_back("A32NX_GPS_PRIMARY_LOST_MSG");
                          VarNames.push_back("A32NX_REFUEL_STARTED_BY_USR");
                          VarNames.push_back("A32NX_NO_SMOKING_MEMO");
                          VarNames.push_back("A32NX_FLAPS_IN_MOTION");
                          VarNames.push_back("32NX_PACKS_1_IS_SUPPLYING");
                          VarNames.push_back("A32NX_ALT_DEVIATION_SHORT");
                          VarNames.push_back("RADIONAV_SOURCE");
                          VarNames.push_back("AIRLINER_FMC_FORCE_NEXT_UPDATE");
                          VarNames.push_back("FMC_UPDATE_CURRENT_PAGE");
                          VarNames.push_back("AIRLINER_MCDU_CURRENT_FPLN_WAYPOINT");
                          VarNames.push_back("AIRLINER_V1_SPEED");
                          VarNames.push_back("AIRLINER_VR_SPEED");
                          VarNames.push_back("AIRLINER_TRANS_ALT");
                          VarNames.push_back("A32NX_SPEEDS_MANAGED_ATHR");
                          VarNames.push_back("A32NX_MachPreselVal");
                          VarNames.push_back("A32NX_SpeedPreselVal");
                          VarNames.push_back("A32NX_FUEL_TOTAL_DESIRED");
                          VarNames.push_back("A32NX_FUEL_DESIRED");
                          VarNames.push_back("A32NX_FUEL_DESIRED_PERCENT");
                          VarNames.push_back("A32NX_FUEL_CENTER_DESIRED");
                          VarNames.push_back("A32NX_FUEL_LEFT_MAIN_DESIRED");
                          VarNames.push_back("A32NX_FUEL_LEFT_AUX_DESIRED");
                          VarNames.push_back("A32NX_FUEL_RIGHT_MAIN_DESIRED");
                          VarNames.push_back("A32NX_FUEL_RIGHT_AUX_DESIRED");
                          VarNames.push_back("A32NX_FADEC_POWERED_ENG1");
                          VarNames.push_back("A32NX_FADEC_POWERED_ENG2");
                          VarNames.push_back("A32NX_SPEEDS_VS");
                          VarNames.push_back("A32NX_SPEEDS_LANDING_CONF3");
                          VarNames.push_back("A32NX_SPEEDS_VFEN");
                          VarNames.push_back("A32NX_SPEEDS_ALPHA_PROTECTION_CALC");
                          VarNames.push_back("A32NX_SPEEDS_ALPHA_MAX_CALC");
                          VarNames.push_back("A32NX_GOAROUND_HDG_MODE");
                          VarNames.push_back("A320_NEO_FCU_FORCE_IDLE_VS");
                          VarNames.push_back("GPSPrimaryMessageDisplayed");
                          VarNames.push_back("APU_BLEED_PRESSURE");
                          VarNames.push_back("A32NX_BRAKE_TEMPERATURE_1");
                          VarNames.push_back("A32NX_BRAKE_TEMPERATURE_2");
                          VarNames.push_back("A32NX_BRAKE_TEMPERATURE_3");
                          VarNames.push_back("A32NX_BRAKE_TEMPERATURE_4");
                          VarNames.push_back("A32NX_FWC_INHIBOVRD");
                          VarNames.push_back("A32NX_FWC_TOMEMO");
                          VarNames.push_back("A32NX_FWC_LDGMEMO");
                          VarNames.push_back("A32NX_ALT_DEVIATION");
                          VarNames.push_back("A320_Neo_FCU_ScreenLuminosity");
                          VarNames.push_back("A320_Neo_FCU_State");
                          VarNames.push_back("A32NX_FCU_SPD_MANAGED_DOT");
                          VarNames.push_back("A32NX_FCU_SPD_MANAGED_DASHES");
                          VarNames.push_back("A32NX_FCU_HDG_MANAGED_DASHES");
                          VarNames.push_back("A32NX_FCU_HDG_MANAGED_DOT");
                          VarNames.push_back("A32NX_FCU_ALT_MANAGED");
                          VarNames.push_back("A320_NE0_FCU_STATE");
                          VarNames.push_back("A32NX_FCU_VS_MANAGED");
                          VarNames.push_back("A320_Neo_MFD_2_ScreenLuminosity");
                          VarNames.push_back("A320_Neo_MFD_2_State");
                          VarNames.push_back("AUTOPILOT_CHRONO_STATE_R");
                          VarNames.push_back("AS1000_Warnings_Master_Set");
                          VarNames.push_back("AS1000_Warnings_WarningIndex");
                          VarNames.push_back("A32NX_FWC_TOCONFIG");
                          VarNames.push_back("A32NX_FWC_RECALL");
                          VarNames.push_back("A32NX_DMC_DISPLAYTEST:3");
                          VarNames.push_back("A32NX_DMC_DISPLAYTEST:1");
                          VarNames.push_back("A32NX_DMC_DISPLAYTEST:2");
                          VarNames.push_back("A32NX_BARO_ATT_RESET");
                          VarNames.push_back("A320_Neo_MFD_1_ScreenLuminosity");
                          VarNames.push_back("A320_Neo_MFD_1_State");
                          VarNames.push_back("AUTOPILOT_CHRONO_STATE_L");
                          VarNames.push_back("A320_Neo_EICAS_1_ScreenLuminosity");
                          VarNames.push_back("A320_Neo_EICAS_1_State");
                          VarNames.push_back("A320_Neo_EICAS_2_ScreenLuminosity");
                          VarNames.push_back("A320_Neo_EICAS_2_State");
                          VarNames.push_back("A320_Neo_SAI_ScreenLuminosity");
                          VarNames.push_back("A320_Neo_SAI_State");
                          VarNames.push_back("A32NX_TO_CONFIG_FLAPS");
                          VarNames.push_back("AIRLINER_FMS_SHOW_TOP_CLIMB");
                          VarNames.push_back("FLIGHTPLAN_USE_DECEL_WAYPOINT");
                          VarNames.push_back("A320_NEO_PREVIEW_DIRECT_TO");
                          VarNames.push_back("AIRLINER_FMS_SHOW_TOP_DSCNT");
                          VarNames.push_back("A32NX_STALL_WARNING");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_ENG_1");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_WING_A_ICE");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_CAT_3_DUAL");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_ENG_1_BLEED");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_PACK_1");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_MAIN_GALLEY");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_GEN_1");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_G_ENG_1_PUMP");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_ENG_2");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_ENG_2_BLEED");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_PACK_2");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_GEN_2");
                          VarNames.push_back("A32NX_COMPANY_MSG_COUNT");
                          VarNames.push_back("HUD_AP_SELECTED_SPEED");
                          VarNames.push_back("HUD_AP_SELECTED_ALTITUDE");
                          VarNames.push_back("A32NX_TO_CONFIG_FLAPS_ENTERED");
                          VarNames.push_back("A32NX_BC3Message");
                          VarNames.push_back("A32NX_ECAM_INOP_SYS_TCAS");
                          VarNames.push_back("A32NX_ADIRS_ADIRU_1_STATE");
                          VarNames.push_back("A32NX_ADIRS_ADIRU_2_STATE");
                          VarNames.push_back("A32NX_ADIRS_ADIRU_3_STATE");
                          VarNames.push_back("A32NX_INITFLIGHT_STATE");
                        }

                        hr = SimConnect_CallDispatch(hSimConnect, ProcessVars, 0);
                        hr = SimConnect_MapClientDataNameToID(hSimConnect, A32NX_LOCAL_DATA_NAME, A32NX_LOCAL_DATA_ID);
                        hr = SimConnect_CreateClientData(hSimConnect, A32NX_LOCAL_DATA_ID, sizeof(ExportData),
                                                         SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
                        hr = SimConnect_AddToClientDataDefinition(hSimConnect, A32NX_LOCAL_DATA_DEFINITION, 0, sizeof(ExportData));
                        hr = SimConnect_SubscribeToSystemEvent(hSimConnect, EVENT_4SEC, "4sec");

                        Control.id = 0;
                        Control.Parameter = 0.0;

                        hr = SimConnect_MapClientDataNameToID(hSimConnect, A32NX_CONTROL_NAME, A32NX_CONTROL_ID);
                        hr = SimConnect_CreateClientData(hSimConnect, A32NX_CONTROL_ID, sizeof(A32NX_Control),
                                                         SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
                        hr = SimConnect_AddToClientDataDefinition(hSimConnect, A32NX_CONTROL_DEFINITION, 0, sizeof(A32NX_Control), 0, 0);
                        hr = SimConnect_RequestClientData(hSimConnect, A32NX_CONTROL_ID, REQ_CONTROL, A32NX_CONTROL_DEFINITION,
                                                          SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET, SIMCONNECT_CLIENT_DATA_REQUEST_FLAG_DEFAULT,
                                                          0, 0, 0);

                        hr = SimConnect_MapClientDataNameToID(hSimConnect, A32NX_ALLDATA_NAME, A32NX_ALLDATA_ID);
                        hr = SimConnect_CreateClientData(hSimConnect, A32NX_ALLDATA_ID, sizeof(double[1000]) + sizeof(INT64),
                                                         SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);

                        for (int i = 0; i < MAX_OUTPUT_VARS; i++) {
                          HRESULT result = SimConnect_AddToClientDataDefinition(
                              hSimConnect, A32NX_ALLDATA_DEFINITION, SIMCONNECT_CLIENTDATAOFFSET_AUTO, SIMCONNECT_CLIENTDATATYPE_FLOAT64);
                        }
                        hr = SimConnect_RequestClientData(hSimConnect, A32NX_ALLDATA_ID, REQ_ALLDATA, A32NX_ALLDATA_DEFINITION,
                                                          SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET, SIMCONNECT_CLIENT_DATA_REQUEST_FLAG_DEFAULT,
                                                          0, 0, 0);

                        AddVars();

                        hr = SimConnect_MapClientEventToSimEvent(hSimConnect, SAVE_VARS, "Autoflight.SAVE_VARS");
                        hr = SimConnect_AddClientEventToNotificationGroup(hSimConnect, GROUP_LOCAL_VARS, SAVE_VARS);
                        hr = SimConnect_SetNotificationGroupPriority(hSimConnect, GROUP_LOCAL_VARS, SIMCONNECT_GROUP_PRIORITY_HIGHEST);
                      }
                    } else {
                    }
                    return true;
                  }
		break;

		case PANEL_SERVICE_PRE_DRAW:
		{
			LocalVariable::readAll();
      ExportVarsSet[MAX_OUTPUT_VARS-1]++;
      hr = SimConnect_SetClientData(hSimConnect, A32NX_ALLDATA_ID, A32NX_ALLDATA_DEFINITION, 0, 0, sizeof(double[MAX_OUTPUT_VARS-1]) + sizeof(INT64), ExportVarsSet);

			return true;
		}
		break;
		case PANEL_SERVICE_PRE_KILL:
		{
      // TO DO
			return true;
		}
		break;
		}
		return false;
	}
