/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const pkg = require(path.join(__dirname, '/../package.json'));
const os = require('os');
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

    this.version = pkg.version;

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
    if (!this.options || !this.options[name]) {
      return defaultVal;
    } else {
      return this.options[name];
    }
  }

  loadAddon(addonPath) {
    try {
      this.addon = require(addonPath);
      return true;
    } catch (err) {
      // not found
    }

    return false;
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

    if (!this.matchVersion('v4.0.0', null)) {
      this.error('Supported Node.js version 4.0.0 or higher');
      return;
    }

    // disable CPU profiler by default for 7.0.0-8.9.3 because of the memory leak.
    if (
      this.options.disableCpuSampler === undefined &&
      (this.matchVersion('v7.0.0', 'v8.9.3') || this.matchVersion('v9.0.0', 'v9.2.1'))
    ) {
      this.log('CPU profiler disabled.');
      this.options.disableCpuSampler = true;
    }

    // disable allocation profiler by default up to version 8.5.0 because of segfaults.
    if (this.options.disableAllocationSampler === undefined && this.matchVersion(null, 'v8.5.0')) {
      this.log('Allocation profiler disabled.');
      this.options.disableAllocationSampler = true;
    }

    // load native addon
    let addonFound = false;

    const platform = os.platform();
    const arch = process.arch;
    const abi = process.versions.modules;

    let family = null;
    if (platform === 'linux') {
      const detectLibc = require('detect-libc');
      family = detectLibc.family;
      if (!family) {
        family = detectLibc.GLIBC;
      }
    }

    let addonPath;
    if (family) {
      addonPath = path.join(__dirname, '..', 'addons', platform, arch, family, abi, 'autoprofile.node');
    } else {
      addonPath = path.join(__dirname, '..', 'addons', platform, arch, abi, 'autoprofile.node');
    }

    if (this.loadAddon(addonPath)) {
      addonFound = true;
      this.log(`Using pre-built native addon from ${addonPath}.`);
    } else {
      this.log(`Could not find pre-built addon at ${addonPath}.`);
    }

    if (!addonFound) {
      if (this.loadAddon('../build/Release/autoprofile-addon.node')) {
        this.log('Using built native addon.');
      } else {
        this.error('Finding/loading of native addon failed. Profiler will not start.');
        return;
      }
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

  matchVersion(min, max) {
    const versionRegexp = /v?(\d+)\.(\d+)\.(\d+)/;

    let m = versionRegexp.exec(process.version);
    const currN = 1e9 * parseInt(m[1], 10) + 1e6 * parseInt(m[2], 10) + 1e3 * parseInt(m[3], 10);

    let minN = 0;
    if (min) {
      m = versionRegexp.exec(min);
      minN = 1e9 * parseInt(m[1], 10) + 1e6 * parseInt(m[2], 10) + 1e3 * parseInt(m[3], 10);
    }

    let maxN = Infinity;
    if (max) {
      m = versionRegexp.exec(max);
      maxN = 1e9 * parseInt(m[1], 10) + 1e6 * parseInt(m[2], 10) + 1e3 * parseInt(m[3], 10);
    }

    return currN >= minN && currN <= maxN;
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
