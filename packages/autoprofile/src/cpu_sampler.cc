#include <deque>
#include <nan.h>
#include "v8.h"
#include "v8-profiler.h"


namespace cpu_profiler {

  const int MAX_DEPTH = 25;

  bool is_started = false;
  v8::CpuProfiler* cpu_profiler;

  static v8::Local<v8::Object> ConvertNode(const v8::CpuProfileNode* node, int depth) {
    v8::Local<v8::Object> node_obj = Nan::New<v8::Object>();
    v8::Local<v8::Array> children_arr = Nan::New<v8::Array>();

    if (depth + 1 < MAX_DEPTH) {
      int children_count = node->GetChildrenCount();
      for (int i = 0; i < children_count; i++) {
        const v8::CpuProfileNode* child = node->GetChild(i);

        v8::Local<v8::Object> child_obj = ConvertNode(child, depth + 1);
        Nan::Set(children_arr, i, child_obj);
      }
    }

    Nan::Set(node_obj, Nan::New<v8::String>("file_name").ToLocalChecked(), node->GetScriptResourceName());
    Nan::Set(node_obj, Nan::New<v8::String>("line_num").ToLocalChecked(), Nan::New<v8::Number>(node->GetLineNumber()));
    Nan::Set(node_obj, Nan::New<v8::String>("col_num").ToLocalChecked(), Nan::New<v8::Number>(node->GetColumnNumber()));
    Nan::Set(node_obj, Nan::New<v8::String>("func_name").ToLocalChecked(), node->GetFunctionName());
    Nan::Set(node_obj, Nan::New<v8::String>("hit_count").ToLocalChecked(), Nan::New<v8::Number>(node->GetHitCount()));
    Nan::Set(node_obj, Nan::New<v8::String>("children").ToLocalChecked(), children_arr);

    return node_obj;
  }


  NAN_METHOD(StartCPUSampler) {
    if (is_started) {
      return;
    }

    is_started = true;

    const v8::Local<v8::String> title = Nan::New<v8::String>("autoprofile-cpu-profile").ToLocalChecked();

#if V8_MAJOR_VERSION * 1000 + V8_MINOR_VERSION > 5005
    cpu_profiler = v8::CpuProfiler::New(info.GetIsolate());
#else
    cpu_profiler = info.GetIsolate()->GetCpuProfiler();
#endif
    int sampling_interval = 10000;
    if (info.Length() > 0) {
      sampling_interval = info[0]->Int32Value(Nan::GetCurrentContext()).FromJust();
    }
    cpu_profiler->SetSamplingInterval(sampling_interval);
    cpu_profiler->StartProfiling(title, false);
  }


  NAN_METHOD(StopCPUSampler) {
    if (!is_started) {
      info.GetReturnValue().SetUndefined();
      return;
    }

    is_started = false;

    const v8::Local<v8::String> title = Nan::New<v8::String>("autoprofile-cpu-profile").ToLocalChecked();
    v8::CpuProfile* cpu_profile = cpu_profiler->StopProfiling(title); 

    if (cpu_profile != NULL) {
      const v8::CpuProfileNode* root = cpu_profile->GetTopDownRoot();
      if (root != NULL) {
        v8::Local<v8::Object> root_obj = ConvertNode(root, 0);
        cpu_profile->Delete();
#if V8_MAJOR_VERSION * 1000 + V8_MINOR_VERSION > 5005
          cpu_profiler->Dispose();
#endif
        info.GetReturnValue().Set(root_obj);
      }
      else {
#if V8_MAJOR_VERSION * 1000 + V8_MINOR_VERSION > 5005
        cpu_profiler->Dispose();
#endif
        info.GetReturnValue().SetUndefined();
      }
    }
    else {
      info.GetReturnValue().SetUndefined();
    }    
  }

}