/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const pkg = require(path.join(__dirname, '..', 'package.json'));
const os = require('os');
const semver = require('semver');
const nodeGypBuild = require('node-gyp-build');
const Utils = require('./utils').Utils;
const ProfileRecorder = require('./profile_recorder').ProfileRecorder;
const SamplerScheduler = require('./sampler_scheduler').SamplerScheduler;
const CpuSampler = require('./samplers/cpu_sampler').CpuSampler;
const AllocationSampler = require('./samplers/allocation_sampler').AllocationSampler;
const AsyncSampler = require('./samplers/async_sampler').AsyncSampler;

let profiler = null;

class AutoProfiler {
  constructor() {
    this.AGENT_FRAME_REGEXP = /node_modules\/@instana\//;

    this.addon = undefined;

    this.profilerStarted = false;
    this.profilerDestroyed = false;

    this.utils = new Utils(this);
    this.profileRecorder = new ProfileRecorder(this);
    this.cpuSamplerScheduler = new SamplerScheduler(this, new CpuSampler(this), {
      logPrefix: 'CPU profiler',
      maxProfileDuration: 10 * 1000,
      maxSpanDuration: 2 * 1000,
      spanInterval: 16 * 1000,
      reportInterval: 120 * 1000
    });
    this.allocationSamplerScheduler = new SamplerScheduler(this, new AllocationSampler(this), {
      logPrefix: 'Allocation profiler',
      maxProfileDuration: 20 * 1000,
      maxSpanDuration: 4 * 1000,
      spanInterval: 16 * 1000,
      reportInterval: 120 * 1000
    });
    this.asyncSamplerScheduler = new SamplerScheduler(this, new AsyncSampler(this), {
      logPrefix: 'Async profiler',
      maxProfileDuration: 20 * 1000,
      maxSpanDuration: 4 * 1000,
      spanInterval: 16 * 1000,
      reportInterval: 120 * 1000
    });

    this.options = undefined;

    this.samplerActive = false;

    this.exitHandlerFunc = undefined;
  }

  getLogger() {
    /* eslint-disable no-console */
    return {
      debug: function (msg) {
        console.log(msg);
      },
      info: function (msg) {
        console.log(msg);
      },
      error: function (msg) {
        console.log(msg);
      },
      exception: function (err) {
        console.log(err.message, err.stack);
      }
    };
    /* eslint-enable no-console */
  }

  getOption(name, defaultVal) {
    if (this.options?.[name] !== undefined) {
      return this.options[name];
    } else {
      return defaultVal;
    }
  }

  loadAddon() {
    try {
      // NOTE: will either load the prebuild or the build from build/release
      //       During the installation process the build is skipped if a prebuild exists.
      this.addon = nodeGypBuild(path.join(__dirname, '..'));
    } catch (err) {
      this.error(`Could not load native autoprofiler addon: ${err.message}`);
    }
  }

  start(opts) {
    if (this.profilerStarted) {
      return;
    }

    if (opts) {
      this.options = opts;
    } else {
      this.options = {};
    }

    if (!semver.satisfies(process.versions.node, pkg.engines.node)) {
      this.error(`This node.js version ${process.versions.node} is not supported.`);
      return;
    }

    const platform = os.platform();
    const arch = process.arch;
    const abi = process.versions.modules;

    let family = null;
    if (platform === 'linux') {
      const detectLibc = require('detect-libc');
      family = detectLibc.familySync();
      if (!family) {
        family = detectLibc.GLIBC;
      }
    }

    this.debug(`System: ${platform}, ${family}, ${arch}, ${abi}`);
    this.loadAddon();

    if (!this.addon) {
      return;
    }

    if (this.profilerDestroyed) {
      this.log('Destroyed profiler cannot be started');
      return;
    }

    this.cpuSamplerScheduler.start();
    this.allocationSamplerScheduler.start();
    this.asyncSamplerScheduler.start();
    this.profileRecorder.start();

    this.exitHandlerFunc = () => {
      if (!this.profilerStarted || this.profilerDestroyed) {
        return;
      }

      try {
        this.destroy();
      } catch (err) {
        this.exception(err);
      }
    };

    process.once('exit', this.exitHandlerFunc);

    this.profilerStarted = true;
    this.log('Profiler started');
  }

  destroy() {
    if (!this.profilerStarted) {
      this.log('Profiler has not been started');
      return;
    }

    if (this.profilerDestroyed) {
      return;
    }

    process.removeListener('exit', this.exitHandlerFunc);

    this.cpuSamplerScheduler.stop();
    this.allocationSamplerScheduler.stop();
    this.asyncSamplerScheduler.stop();
    this.profileRecorder.stop();

    this.profilerDestroyed = true;
    this.log('Profiler destroyed');
  }

  profile() {
    const self = this;

    if (!self.profilerStarted || self.samplerActive) {
      return {
        stop: function (callback) {
          callback();
        }
      };
    }

    const schedulers = [];
    if (self.cpuSamplerScheduler.started) {
      schedulers.push(self.cpuSamplerScheduler);
    }
    if (self.allocationSamplerScheduler.started) {
      schedulers.push(self.allocationSamplerScheduler);
    }
    if (self.asyncSamplerScheduler.started) {
      schedulers.push(self.asyncSamplerScheduler);
    }

    let span = null;
    let scheduler = null;
    if (schedulers.length === 1) {
      scheduler = schedulers[0];
    } else if (schedulers.length > 1) {
      // Although the usage of "Math.random()"" is not allowed for being FedRamp compliant, but
      // this use case is a non secure workflow.
      scheduler = schedulers[Math.floor(Math.random() * schedulers.length)];
    }

    if (scheduler) {
      span = scheduler.profile();
    }

    return {
      stop: function (callback) {
        if (span) {
          span.stop();
        }
        if (scheduler && self.getOption('disableTimers')) {
          scheduler.report();
          self.profileRecorder.flush(err => {
            if (err) {
              self.exception(err);
            }
            callback();
          });
        } else {
          callback();
        }
      }
    };
  }

  _report(scheduler, callback) {
    const self = this;

    if (scheduler) {
      scheduler.report();
    }

    self.profileRecorder.flush(err => {
      if (err) {
        self.exception(err);
      }

      callback();
    });
  }

  debug(message) {
    this.getLogger().debug(message);
  }

  log(message) {
    this.getLogger().info(message);
  }

  error(message) {
    this.getLogger().error(message);
  }

  exception(err) {
    this.getLogger().error(err.message, err.stack);
  }

  setTimeout(func, t) {
    return setTimeout(() => {
      try {
        func.call(this);
      } catch (err) {
        this.exception(err);
      }
    }, t);
  }

  setInterval(func, t) {
    return setInterval(() => {
      try {
        func.call(this);
      } catch (err) {
        this.exception(err);
      }
    }, t);
  }
}

exports.start = function start(opts) {
  if (!profiler) {
    profiler = new AutoProfiler();
    profiler.start(opts);
  }
  return profiler;
};

exports.destroy = function destroy() {
  if (profiler) {
    profiler.destroy();
  }
};

exports.AutoProfiler = AutoProfiler;
