#pragma once

#include <iostream>
#include <set>
#include <string>
#include <utility>

#include <MSFS\Legacy\gauges.h>

class LocalVariable {
 public:
  explicit LocalVariable(const std::string& name, ID i, ID EId, double ExportVars[], bool shouldUseDirtyState = true);
  ~LocalVariable();

  std::string getName();

  double get(bool shouldRead = false);
  void set(double newValue, bool shouldWrite = true);

  void read();
  void write();

  static void readAll();
  static void writeAll();

 private:
  static std::set<LocalVariable*> LOCAL_VARIABLES;

  double* ExportV;
  ID id;
  ID ExportId;
  std::string name;
  bool useDirtyState;
  bool isDirty;
  double value;
};
