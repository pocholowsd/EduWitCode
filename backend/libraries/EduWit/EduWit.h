#ifndef EDUWIT_H
#define EDUWIT_H

#include "EduWit_Constantes.h"

#if defined(ARDUINO_AVR_NANO) || defined(USAR_EDUBOARD_PRO)
  #warning "EduBoard Profesional en desarrollo. Selecciona Arduino UNO para EduBoard UNO."
#elif defined(ARDUINO_ARCH_ESP32) || defined(USAR_EDUBOARD_ESP32)
  #warning "EduBoard ESP32 en desarrollo. Selecciona Arduino UNO para EduBoard UNO."
#else
  #include "EduBoardUNO.h"
#endif

#endif