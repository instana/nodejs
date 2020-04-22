#ifndef ADDON_CPU_SAMPLER_H_
#define ADDON_CPU_SAMPLER_H_

#include <nan.h>

namespace cpu_profiler {

  NAN_METHOD(StartCPUSampler);

  NAN_METHOD(StopCPUSampler);

}

#endif  // ADDON_CPU_SAMPLER_H_