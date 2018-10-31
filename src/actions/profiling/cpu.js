'use strict';

var logger = require('../../logger').getLogger('actions/profiling/cpu');

var profiler;
var samplingIntervalMicros = 1000; /* v8 profiler default */
var maxProfilingDurationMillis = 1000 * 60 * 10;

var profilingCallback;
var profilingTimeoutHandle;

exports.init = function() {
  try {
    profiler = require('v8-profiler-node8');
  } catch (error) {
    logger.info(
      'Could not load v8-profiler-node8. You will not be able to gather CPU profiles via ' +
        'Instana for this application. This typically occurs when native addons could not be ' +
        'installed during module installation (npm install). See the instructions to learn more ' +
        'about the requirements of the sensor: ' +
        'https://github.com/instana/nodejs-sensor/blob/master/README.md'
    );
  }
};

exports.startProfiling = function(request, multiCb) {
  if (!profiler) {
    multiCb({
      error: 'v8-profiler-node8 was not properly installed. Cannot gather CPU profile.'
    });
    return;
  }

  // abort previously existing profiling run.
  if (profilingTimeoutHandle) {
    clearTimeout(profilingTimeoutHandle);
    profilingTimeoutHandle = null;
    profilingCallback = null;
    profiler.stopProfiling().delete();
    logger.info('CPU profiling was started while another CPU profile was being generated.');
  }

  profiler.setSamplingInterval(samplingIntervalMicros);
  profiler.startProfiling();
  profilingCallback = multiCb;
  var duration = request.args.duration ? Math.min(request.args.duration, maxProfilingDurationMillis) : 1000 * 60;
  profilingTimeoutHandle = setTimeout(onStopProfiling, duration);
  multiCb({
    data: 'Profiling successfully started for ' + duration + 'ms.'
  });
};

exports.stopProfiling = function(request, multiCb) {
  if (!profilingTimeoutHandle) {
    multiCb({
      data: 'No active CPU profiling session found.'
    });
    return;
  }

  clearTimeout(profilingTimeoutHandle);

  if (request.args.abort) {
    profiler.stopProfiling().delete();
    multiCb({
      data: 'CPU profiling successfully aborted.'
    });
  } else {
    onStopProfiling();
    multiCb({
      data: 'CPU profiling successfully stopped.'
    });
  }

  profilingTimeoutHandle = null;
  profilingCallback = null;
};

function onStopProfiling() {
  profilingTimeoutHandle = null;

  var profile = profiler.stopProfiling();
  var profileWithTimingInformation = exports.toTreeWithTiming(profile, samplingIntervalMicros);
  profile.delete();

  profilingCallback({ data: profileWithTimingInformation });
  profilingCallback = null;
}

exports.toTreeWithTiming = function toTreeWithTiming(profile) {
  return processRawNode(profile.head);
};

function processRawNode(rawNode) {
  var node = {
    f: rawNode.functionName,
    u: rawNode.url,
    l: rawNode.lineNumber,
    sh: rawNode.hitCount,
    th: rawNode.hitCount,
    s: 0,
    t: 0,
    b: getBailoutReason(rawNode),
    c: []
  };

  var children = rawNode.children;
  for (var i = 0, len = children.length; i < len; i++) {
    var childNode = processRawNode(children[i], samplingIntervalMicros);
    node.c.push(childNode);
    node.th += childNode.th;
  }

  node.t = node.th * samplingIntervalMicros;
  node.s = node.sh * samplingIntervalMicros;

  return node;
}

function getBailoutReason(rawNode) {
  var reason = rawNode.bailoutReason;
  if (!reason || reason === 'no reason') {
    return undefined;
  }
  return reason;
}
