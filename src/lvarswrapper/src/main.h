#pragma once

#include <string.h>
#include <math.h>

#ifndef __INTELLISENSE__
#define MODULE_EXPORT __attribute__((visibility("default")))
#define MODULE_WASM_MODNAME(mod) __attribute__((import_module(mod)))
#else
#define MODULE_EXPORT
#define MODULE_WASM_MODNAME(mod)
#define __attribute__(x)
#define __restrict__
#endif


#ifdef _MSC_VER
#define snprintf _snprintf_s
#elif !defined(__MINGW32__)
#include <iconv.h>
#endif

#define A32NX_LOCAL_DATA_NAME			  "A32NX_Local_Data"
#define A32NX_LOCAL_DATA_ID			    0x4E877779
#define A32NX_LOCAL_DATA_DEFINITION	0x4E877780

#define A32NX_CONTROL_NAME		      "A32NX_Control"
#define A32NX_CONTROL_ID			      0x4E877781
#define A32NX_CONTROL_DEFINITION	  0x4E877782

#define A32NX_ALLDATA_NAME		      "A32NX_AllData"
#define A32NX_ALLDATA_ID			      0x4E877783
#define A32NX_ALLDATA_DEFINITION	  0x4E877784


#define MAX_OUTPUT_VARS             1001
#define MAX_IDS_VARS                6000
