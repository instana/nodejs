#include <nan.h>
#include "cpu_sampler.h"
#include "allocation_sampler.h"


NAN_MODULE_INIT(InitAll) {
  Nan::Set(target, 
    Nan::New<v8::String>("startCpuSampler").ToLocalChecked(),
    Nan::GetFunction(Nan::New<v8::FunctionTemplate>(cpu_profiler::StartCPUSampler)).ToLocalChecked());

  Nan::Set(target, 
    Nan::New<v8::String>("stopCpuSampler").ToLocalChecked(),
    Nan::GetFunction(Nan::New<v8::FunctionTemplate>(cpu_profiler::StopCPUSampler)).ToLocalChecked());

  Nan::Set(target, 
    Nan::New<v8::String>("checkAllocationSampler").ToLocalChecked(),
    Nan::GetFunction(Nan::New<v8::FunctionTemplate>(allocation_sampler::CheckAllocationSampler)).ToLocalChecked());

#if V8_MAJOR_VERSION >= 5
  Nan::Set(target, 
    Nan::New<v8::String>("startAllocationSampler").ToLocalChecked(),
    Nan::GetFunction(Nan::New<v8::FunctionTemplate>(allocation_sampler::StartAllocationSampler)).ToLocalChecked());

  Nan::Set(target, 
    Nan::New<v8::String>("stopAllocationSampler").ToLocalChecked(),
    Nan::GetFunction(Nan::New<v8::FunctionTemplate>(allocation_sampler::StopAllocationSampler)).ToLocalChecked());

  Nan::Set(target, 
    Nan::New<v8::String>("readAllocationProfile").ToLocalChecked(),
    Nan::GetFunction(Nan::New<v8::FunctionTemplate>(allocation_sampler::ReadAllocationProfile)).ToLocalChecked());
#endif

}

NODE_MODULE(addon, InitAll)

