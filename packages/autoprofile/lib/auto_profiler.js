'use strict';

const path = require('path');
const pkg = require(path.join(__dirname, '/../package.json'));
const abiMap = require(path.join(__dirname, '/../abi-map.json'));
const os = require('os');
const Utils = require('./utils').Utils;
const ProfileRecorder = require('./profile_recorder').ProfileRecorder;
const SamplerScheduler = require('./sampler_scheduler').SamplerScheduler;
const CpuSampler = require('./samplers/cpu_sampler').CpuSampler;
const AllocationSampler = require('./samplers/allocation_sampler').AllocationSampler;
const AsyncSampler = require('./samplers/async_sampler').AsyncSampler;


var profiler = null;

class AutoProfiler {
  constructor() {
    let self = this;

    self.AGENT_FRAME_REGEXP = /node_modules\/@instana\//;

    self.version = pkg.version;

    self.addon = undefined;

    self.profilerStarted = false;
    self.profilerDestroyed = false;

    self.utils = new Utils(self);
    self.profileRecorder = new ProfileRecorder(self);
    self.cpuSamplerScheduler = new SamplerScheduler(self, new CpuSampler(self), {
      logPrefix: 'CPU profiler',
      maxProfileDuration: 10 * 1000,
      maxSpanDuration: 2 * 1000,
      spanInterval: 16 * 1000,
      reportInterval: 120 * 1000,
    });
    self.allocationSamplerScheduler = new SamplerScheduler(self, new AllocationSampler(self), {
      logPrefix: 'Allocation profiler',
      maxProfileDuration: 20 * 1000,
      maxSpanDuration: 4 * 1000,
      spanInterval: 16 * 1000,
      reportInterval: 120 * 1000
    });
    self.asyncSamplerScheduler = new SamplerScheduler(self, new AsyncSampler(self), {
      logPrefix: 'Async profiler',
      maxProfileDuration: 20 * 1000,
      maxSpanDuration: 4 * 1000,
      spanInterval: 16 * 1000,
      reportInterval: 120 * 1000
    });

    self.options = undefined;

    self.samplerActive = false;

    self.exitHandlerFunc = undefined;
  }

  getLogger() {
    /* eslint-disable no-console */
    return {
      debug: function(msg) {
        console.log(msg);
      },
      info: function(msg) {
        console.log(msg);
      },
      error: function(msg) {
        console.log(msg);
      },
      exception: function(err) {
        console.log(err.message, err.stack);
      }
    };
    /* eslint-enable no-console */
  }

  getOption(name, defaultVal) {
    let self = this;

    if (!self.options || !self.options[name]) {
      return defaultVal;
    } else {
      return self.options[name];
    }
  }


  loadAddon(addonPath) {
    let self = this;

    try {
      self.addon = require(addonPath);
      return true;
     } catch (err) {
      // not found
    }

    return false;
  }


  start(opts) {
    let self = this;

    if (self.profilerStarted) {
      return;
    }

    if (opts) {
      self.options = opts;
    } else {
      self.options = {};
    }

    if (!self.matchVersion('v4.0.0', null)) {
      self.error('Supported Node.js version 4.0.0 or higher');
      return;
    }

    // disable CPU profiler by default for 7.0.0-8.9.3 because of the memory leak.
    if (self.options.cpuProfilerDisabled === undefined &&
        (self.matchVersion('v7.0.0', 'v8.9.3') || self.matchVersion('v9.0.0', 'v9.2.1'))) {
      self.log('CPU profiler disabled.');
      self.options.cpuProfilerDisabled = true;
    }

    // disable allocation profiler by default up to version 8.5.0 because of segfaults.
    if (self.options.allocationProfilerDisabled === undefined && self.matchVersion(null, 'v8.5.0')) {
      self.log('Allocation profiler disabled.');
      self.options.allocationProfilerDisabled = true;
    }

    // load native addon
    let addonFound = false;

    let abi = abiMap[process.version];
    if (abi) {
      let addonPath = `../addons/${os.platform()}-${process.arch}/autoprofile-addon-v${abi}.node`;
      if (self.loadAddon(addonPath)) {
        addonFound = true;
        self.log('Using pre-built native addon.');
      } else {
        self.log('Could not find pre-built addon: ' + addonPath);
      }
    }

    if (!addonFound) {
      if (self.loadAddon('../build/Release/autoprofile-addon.node')) {
        self.log('Using built native addon.');
      } else {
        self.error('Finding/loading of native addon failed. Profiler will not start.');
        return;
      }
    }

    if (self.profilerDestroyed) {
      self.log('Destroyed profiler cannot be started');
      return;
    }

    if (!self.options.dashboardAddress) {
      self.options.dashboardAddress = self.SAAS_DASHBOARD_ADDRESS;
    }

    self.cpuSamplerScheduler.start();
    self.allocationSamplerScheduler.start();
    self.asyncSamplerScheduler.start();
    self.profileRecorder.start();

    self.exitHandlerFunc = function() {
      if (!self.profilerStarted || self.profilerDestroyed) {
        return;
      }

      try {
        self.destroy();
      } catch (err) {
        self.exception(err);
      }
    };

    process.once('exit', self.exitHandlerFunc);

    self.profilerStarted = true;
    self.log('Profiler started');
  }


  destroy() {
    let self = this;

    if (!self.profilerStarted) {
      self.log('Profiler has not been started');
      return;
    }

    if (self.profilerDestroyed) {
      return;
    }

    process.removeListener('exit', self.exitHandlerFunc);

    self.cpuSamplerScheduler.stop();
    self.allocationSamplerScheduler.stop();
    self.asyncSamplerScheduler.stop();
    self.profileRecorder.stop();

    self.profilerDestroyed = true;
    self.log('Profiler destroyed');
  }


  matchVersion(min, max) {
    let versionRegexp = /v?(\d+)\.(\d+)\.(\d+)/;

    let m = versionRegexp.exec(process.version);
    let currN = 1e9 * parseInt(m[1], 10) + 1e6 * parseInt(m[2], 10) + 1e3 * parseInt(m[3], 10);

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
    let self = this;

    self.getLogger().debug(message);
  }

  log(message) {
    let self = this;

    self.getLogger().info(message);
  }


  error(message) {
    let self = this;

    self.getLogger().error(message);
  }


  exception(err) {
    let self = this;

    self.getLogger().error(err.message, err.stack);
  }


  setTimeout(func, t) {
    let self = this;

    return setTimeout(() => {
      try {
        func.call(this);
      } catch (err) {
        self.exception(err);
      }
    }, t);
  }


  setInterval(func, t) {
    let self = this;

    return setInterval(() => {
      try {
        func.call(this);
      } catch (err) {
        self.exception(err);
      }
    }, t);
  }
}

exports.start = function(opts) {
  if (!profiler) {
    profiler = new AutoProfiler();
    profiler.start(opts);
  }
  return profiler;
};

exports.destroy = function() {
  if (profiler) {
    profiler.destroy();
  }
};

exports.AutoProfiler = AutoProfiler;
