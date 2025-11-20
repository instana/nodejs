/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

// @ts-nocheck

const AutoProfiler = require('./lib/auto_profiler').AutoProfiler;

let profiler = null;

exports.start = function start(opts) {
  if (!profiler) {
    profiler = new AutoProfiler();
  }

  profiler.start(opts);
  return profiler;
};

exports.AutoProfiler = AutoProfiler;
