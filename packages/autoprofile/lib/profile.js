'use strict';

const process = require('process');


const profileConstants = {
  CATEGORY_CPU: 'cpu',
  CATEGORY_MEMORY: 'memory',
  CATEGORY_TIME: 'time',
  TYPE_CPU_USAGE: 'cpu-usage',
  TYPE_MEMORY_ALLOCATION_RATE: 'memory-allocation-rate',
  TYPE_ASYNC_CALLS: 'async-calls',
  UNIT_NONE: '',
  UNIT_MILLISECOND: 'millisecond',
  UNIT_MICROSECOND: 'microsecond',
  UNIT_NANOSECOND: 'nanosecond',
  UNIT_BYTE: 'byte',
  UNIT_KILOBYTE: 'kilobyte',
  UNIT_PERCENT: 'percent',
  UNIT_SAMPLE: 'sample',
  RUNTIME_NODEJS: 'nodejs'
};


class CallSite {
  constructor(profiler, methodName, fileName, fileLine, columnNumber) {
    let self = this;

    self.profiler = profiler;
    self.methodName = methodName;
    self.fileName = fileName;
    self.fileLine = fileLine;
    self.columnNumber = columnNumber;
    self.measurement = 0;
    self.numSamples = 0;
    self.children = new Map();
  }


  createKey(methodName, fileName, fileLine) {
    return methodName + ' (' + fileName + ':' + fileLine + ')';
  }


  findChild(methodName, fileName, fileLine) {
    let self = this;

    return self.children.get(self.createKey(methodName, fileName, fileLine));
  }


  addChild(child) {
    let self = this;

    self.children.set(self.createKey(child.methodName, child.fileName, child.fileLine), child);
  }


  removeChild(child) {
    let self = this;

    self.children.delete(self.createKey(child.methodName, child.fileName, child.fileLine));
  }


  findOrAddChild(methodName, fileName, fileLine) {
    let self = this;

    let child = self.findChild(methodName, fileName, fileLine);
    if (!child) {
      child = new CallSite(self.profiler, methodName, fileName, fileLine);
      self.addChild(child);
    }

    return child;
  }


  increment(value, count) {
    let self = this;

    self.measurement += value;
    self.numSamples += count;
  }


  depth() {
    let self = this;

    let max = 0;

    for (let child of self.children.values()) {
      let d = child.depth();
      if (d > max) {
        max = d;
      }
    }

    return max + 1;
  }


  toJson() {
    let self = this;

    let childrenJson = [];
    for (let child of self.children.values()) {
      childrenJson.push(child.toJson());
    }

    let callSiteJson = {
      method_name: self.methodName,
      file_name: self.fileName,
      file_line: self.fileLine,
      measurement: self.measurement,
      num_samples: self.numSamples,
      children: childrenJson
    };

    return callSiteJson;
  }
}

exports.CallSite = CallSite;


class Profile {
  constructor(profiler, category, type, unit, roots, duration, timespan) {
    let self = this;

    self.profiler = profiler;
    self.processId = '' + process.pid;
    self.id = profiler.utils.generateUuid();
    self.runtime = Profile.c.RUNTIME_NODEJS;
    self.category = category;
    self.type = type;
    self.unit = unit;
    self.roots = roots;
    self.duration = duration;
    self.timespan = timespan;
    self.timestamp = profiler.utils.millis();
  }

  static get c() {
    return profileConstants;
  }

  toJson() {
    let self = this;

    let rootsJson = [];
    for (let root of self.roots.values()) {
      rootsJson.push(root.toJson());
    }

    let profileJson = {
      pid: self.processId,
      id: self.id,
      runtime: self.runtime,
      category: self.category,
      type: self.type,
      unit: self.unit,
      roots: rootsJson,
      duration: self.duration,
      timespan: self.timespan,
      timestamp: self.timestamp
    };

    return profileJson;
  }
}

exports.Profile = Profile;
