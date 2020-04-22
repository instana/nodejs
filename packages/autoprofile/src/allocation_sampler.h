#ifndef ADDON_ALLOCATION_SAMPLER_H_
#define ADDON_ALLOCATION_SAMPLER_H_

#include <nan.h>


namespace allocation_sampler {

  NAN_METHOD(CheckAllocationSampler);

#if V8_MAJOR_VERSION >= 5
  NAN_METHOD(StartAllocationSampler);

  NAN_METHOD(StopAllocationSampler);

  NAN_METHOD(ReadAllocationProfile);
#endif

}

#endif  // ADDON_ALLOCATION_SAMPLER_H_