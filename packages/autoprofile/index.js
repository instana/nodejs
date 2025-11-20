/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

// TODO: remove @ts-nocheck and add proper typing and
// linting support for @instana/autoprofile (INSTA-65031)

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
