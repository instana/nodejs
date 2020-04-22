let AutoProfiler = require('./lib/auto_profiler').AutoProfiler;


let profiler = null;

exports.start = function(opts) {
  if(!profiler) {
    profiler = new AutoProfiler();
  }

  profiler.start(opts);
  return profiler;
};

exports.AutoProfiler = AutoProfiler;
