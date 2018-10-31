'use strict';

var Module = require('module');
var path = require('path');

var executedHooks = {};
var byModuleNameTransformers = {};
var byFileNamePatternTransformers = [];
var origLoad = Module._load;

exports.init = function() {
  Module._load = patchedModuleLoad;
};

function patchedModuleLoad(moduleName) {
  var i;

  // First attempt to always get the module via the original implementation
  // as this action may fail. The original function populates the module cache.
  var moduleExports = origLoad.apply(Module, arguments);
  var filename = Module._resolveFilename.apply(Module, arguments);

  // We are not directly manipulating the global module cache because there might be other tools fiddling with
  // Module._load. We don't want to break any of them.
  var cacheEntry = (executedHooks[filename] = executedHooks[filename] || {
    originalModuleExports: moduleExports,
    moduleExports: moduleExports,

    // We might have already seen and processed, i.e. manipulated, this require statement. This is something we
    // are checking using these fields.
    appliedByModuleNameTransformers: [],
    byFileNamePatternTransformersApplied: false
  });

  // Some non-APM modules are fiddling with the require cache in some very unexpected ways.
  // For example the request-promise* modules use stealthy-require to always get a fresh copy
  // of the request module. Instead of adding a mechanism to get a copy the request function,
  // they temporarily force clear the require cache and require the request module again
  // to get a copy.
  //
  // In order to ensure that any such (weird) use cases are supported by us, we are making sure
  // that we only return our patched variant when Module._load returned the same object based
  // on which we applied our patches.
  if (cacheEntry.originalModuleExports !== moduleExports) {
    return moduleExports;
  }

  var applicableByModuleNameTransformers = byModuleNameTransformers[moduleName];
  if (applicableByModuleNameTransformers && cacheEntry.appliedByModuleNameTransformers.indexOf(moduleName) === -1) {
    for (i = 0; i < applicableByModuleNameTransformers.length; i++) {
      cacheEntry.moduleExports =
        applicableByModuleNameTransformers[i](cacheEntry.moduleExports) || cacheEntry.moduleExports;
    }
    cacheEntry.appliedByModuleNameTransformers.push(moduleName);
  }

  if (!cacheEntry.byFileNamePatternTransformersApplied) {
    for (i = 0; i < byFileNamePatternTransformers.length; i++) {
      if (byFileNamePatternTransformers[i].pattern.test(filename)) {
        cacheEntry.moduleExports =
          byFileNamePatternTransformers[i].fn(cacheEntry.moduleExports) || cacheEntry.moduleExports;
      }
    }
    cacheEntry.byFileNamePatternTransformersApplied = true;
  }

  return cacheEntry.moduleExports;
}

exports.teardownForTestPurposes = function() {
  Module._load = origLoad;
  executedHooks = {};
  byModuleNameTransformers = {};
};

exports.onModuleLoad = function on(moduleName, fn) {
  byModuleNameTransformers[moduleName] = byModuleNameTransformers[moduleName] || [];
  byModuleNameTransformers[moduleName].push(fn);
};

exports.onFileLoad = function onFileLoad(pattern, fn) {
  byFileNamePatternTransformers.push({
    pattern: pattern,
    fn: fn
  });
};

exports.buildFileNamePattern = function buildFileNamePattern(arr) {
  return new RegExp(arr.reduce(buildFileNamePatternReducer, '') + '$');
};

function buildFileNamePatternReducer(agg, pathSegment) {
  if (agg.length > 0) {
    agg += '\\' + path.sep;
  }
  agg += pathSegment;
  return agg;
}
