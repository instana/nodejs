#include <nan.h>
#include "v8.h"
#include "v8-profiler.h"



namespace allocation_sampler {

  const int MAX_DEPTH = 25;

  bool is_started = false;


  NAN_METHOD(CheckAllocationSampler) {
#if V8_MAJOR_VERSION >= 5
    if (info.GetIsolate()->GetHeapProfiler()) {
      info.GetReturnValue().Set(true);
    }
    else {
      info.GetReturnValue().Set(false);
    }
#else
      info.GetReturnValue().Set(false);
#endif
  }


#if V8_MAJOR_VERSION >= 5

  NAN_METHOD(StartAllocationSampler) {
    if(is_started) {
      return;
    }

    is_started = true;

    unsigned int sampling_interval = 1 << 19;
    info.GetIsolate()->GetHeapProfiler()->StartSamplingHeapProfiler(sampling_interval, MAX_DEPTH);
  }


  NAN_METHOD(StopAllocationSampler) {
    if(!is_started) {
      info.GetReturnValue().SetUndefined();
      return;
    }

    is_started = false;

    info.GetIsolate()->GetHeapProfiler()->StopSamplingHeapProfiler();
  }


  static v8::Local<v8::Object> ConvertNode(const v8::AllocationProfile::Node* node, int depth) {
    v8::Local<v8::Object> node_obj = Nan::New<v8::Object>();
    v8::Local<v8::Array> children_arr = Nan::New<v8::Array>();

    unsigned int total_count = 0;
    size_t total_size = 0;
    for (auto allocation : node->allocations) {
      total_count += allocation.count;
      total_size += allocation.size * allocation.count;
    }

    if (depth + 1 < MAX_DEPTH) {
      int i = 0;
      for (auto child : node->children) {
        v8::Local<v8::Object> child_obj = ConvertNode(child, depth + 1);
        Nan::Set(children_arr, i++, child_obj);
      }
    }

    Nan::Set(node_obj, Nan::New<v8::String>("file_name").ToLocalChecked(), node->script_name);
    Nan::Set(node_obj, Nan::New<v8::String>("line_num").ToLocalChecked(), Nan::New<v8::Number>(node->line_number));
    Nan::Set(node_obj, Nan::New<v8::String>("col_num").ToLocalChecked(), Nan::New<v8::Number>(node->column_number));
    Nan::Set(node_obj, Nan::New<v8::String>("func_name").ToLocalChecked(), node->name);
    Nan::Set(node_obj, Nan::New<v8::String>("count").ToLocalChecked(), Nan::New<v8::Number>(total_count));
    Nan::Set(node_obj, Nan::New<v8::String>("size").ToLocalChecked(), Nan::New<v8::Number>(total_size));
    Nan::Set(node_obj, Nan::New<v8::String>("children").ToLocalChecked(), children_arr);

    return node_obj;
  }


  NAN_METHOD(ReadAllocationProfile) {
    if(!is_started) {
      info.GetReturnValue().SetUndefined();
      return;
    }

    v8::AllocationProfile *profile = info.GetIsolate()->GetHeapProfiler()->GetAllocationProfile();
    if (profile) {
      v8::Local<v8::Object> root_obj = ConvertNode(profile->GetRootNode(), 0);
      delete profile;
      profile = NULL;
      info.GetReturnValue().Set(root_obj);
    }
    else {
      info.GetReturnValue().SetUndefined();
    }
  }

#endif

}

