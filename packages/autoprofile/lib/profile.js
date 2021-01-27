/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable no-restricted-syntax */

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
    this.profiler = profiler;
    this.methodName = methodName;
    this.fileName = fileName;
    this.fileLine = fileLine;
    this.columnNumber = columnNumber;
    this.measurement = 0;
    this.numSamples = 0;
    this.children = new Map();
  }

  createKey(methodName, fileName, fileLine) {
    return methodName + ' (' + fileName + ':' + fileLine + ')';
  }

  findChild(methodName, fileName, fileLine) {
    return this.children.get(this.createKey(methodName, fileName, fileLine));
  }

  addChild(child) {
    this.children.set(this.createKey(child.methodName, child.fileName, child.fileLine), child);
  }

  removeChild(child) {
    this.children.delete(this.createKey(child.methodName, child.fileName, child.fileLine));
  }

  findOrAddChild(methodName, fileName, fileLine) {
    let child = this.findChild(methodName, fileName, fileLine);
    if (!child) {
      child = new CallSite(this.profiler, methodName, fileName, fileLine);
      this.addChild(child);
    }

    return child;
  }

  increment(value, count) {
    this.measurement += value;
    this.numSamples += count;
  }

  depth() {
    let max = 0;

    for (const child of this.children.values()) {
      const d = child.depth();
      if (d > max) {
        max = d;
      }
    }

    return max + 1;
  }

  toJson() {
    const childrenJson = [];
    for (const child of this.children.values()) {
      childrenJson.push(child.toJson());
    }

    const callSiteJson = {
      method_name: this.methodName,
      file_name: this.fileName,
      file_line: this.fileLine,
      measurement: this.measurement,
      num_samples: this.numSamples,
      children: childrenJson
    };

    return callSiteJson;
  }
}

class Profile {
  constructor(profiler, category, type, unit, roots, duration, timespan) {
    this.profiler = profiler;
    this.processId = '' + process.pid;
    this.id = profiler.utils.generateUuid();
    this.runtime = Profile.c.RUNTIME_NODEJS;
    this.category = category;
    this.type = type;
    this.unit = unit;
    this.roots = roots;
    this.duration = duration;
    this.timespan = timespan;
    this.timestamp = profiler.utils.millis();
  }

  static get c() {
    return profileConstants;
  }

  toJson() {
    const rootsJson = [];
    for (const root of this.roots.values()) {
      rootsJson.push(root.toJson());
    }

    const profileJson = {
      pid: this.processId,
      id: this.id,
      runtime: this.runtime,
      category: this.category,
      type: this.type,
      unit: this.unit,
      roots: rootsJson,
      duration: this.duration,
      timespan: this.timespan,
      timestamp: this.timestamp
    };

    return profileJson;
  }
}

exports.CallSite = CallSite;
exports.Profile = Profile;
