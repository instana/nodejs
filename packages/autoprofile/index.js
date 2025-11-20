/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/*
 * NOTE: Even though the 'autoprofile' directory is excluded in tsconfig, the TypeScript
 * compiler (with allowJs/checkJs) still type-checks its source files when they are imported
 * see: https://www.typescriptlang.org/tsconfig/#exclude
 * To skip checking, we must either refactor to a
 * package-name import or use an explicit // @ts-nocheck directive
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
