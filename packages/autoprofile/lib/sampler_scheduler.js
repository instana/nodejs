'use strict';

class SamplerScheduler {
  constructor(profiler, sampler, config) {
    let self = this;

    self.profiler = profiler;
    self.sampler = sampler;
    self.config = config;
    self.started = false;
    self.spanTimer = undefined;
    self.randomTimer = undefined;
    self.reportTimer = undefined;
    self.profileStartTs = undefined;
    self.profileDuration = undefined;
  }


  start() {
    let self = this;

    if (!self.sampler.test()) {
      return;
    }

    if (self.started) {
      return;
    }
    self.started = true;

    self.reset();

    self.spanTimer = self.profiler.setInterval(() => {
      self.randomTimer = self.profiler.setTimeout(() => {
        self.profile(false, true);
      }, Math.round(Math.random() * (self.config.spanInterval - self.config.maxSpanDuration)));
    }, self.config.spanInterval);

    self.reportTimer = self.profiler.setInterval(() => {
      self.report();
    }, self.config.reportInterval);
  }


  stop() {
    let self = this;

    if (!self.started) {
      return;
    }
    self.started = false;

    if (self.spanTimer) {
      clearInterval(self.spanTimer);
      self.spanTimer = undefined;
    }

    if (self.randomTimer) {
      clearTimeout(self.randomTimer);
      self.randomTimer = undefined;
    }

    if (self.reportTimer) {
      clearInterval(self.reportTimer);
      self.reportTimer = undefined;
    }
  }


  reset() {
    let self = this;

    self.sampler.reset();
    self.profileStartTs = Date.now();
    self.profileDuration = 0;
  }


  profile() {
    let self = this;

    if (!self.started) {
      return null;
    }

    if (self.profileDuration > self.config.maxProfileDuration) {
      self.profiler.debug(self.config.logPrefix + ': max profiling duration reached.');
      return null;
    }

    if (self.profiler.samplerActive) {
      self.profiler.debug(self.config.logPrefix + ': sampler lock exists.');
      return null;
    }
    self.profiler.samplerActive = true;
    self.profiler.debug(self.config.logPrefix + ': started.');

    try {
      self.sampler.startSampler();
    } catch (err) {
      self.profiler.samplerActive = false;
      self.profiler.exception(err);
      return null;
    }

    let spanStart = Date.now();

    let stopped = false;
    function _stop() {
      if (stopped) {
        return;
      }
      stopped = true;

      try {
        self.profileDuration += Date.now() - spanStart;
        self.sampler.stopSampler();
        self.profiler.samplerActive = false;
        self.profiler.debug(self.config.logPrefix + ': stopped.');
      } catch (err) {
        self.profiler.samplerActive = false;
        self.profiler.exception(err);
      }
    }

    self.profiler.setTimeout(() => {
      _stop();
    }, self.config.maxSpanDuration);
  }


  report() {
    let self = this;

    if (!self.started) {
      return;
    }

    if (self.profileDuration === 0) {
      return;
    }

    self.profiler.debug(self.config.logPrefix + ': reporting profile.');

    let profile = self.sampler.buildProfile(self.profileDuration, Date.now() - self.profileStartTs);

    let externalPid = self.profiler.getExternalPid();
    if (externalPid) {
      profile.processPid = externalPid;
    }

    self.profiler.profileRecorder.record(profile.toJson());

    self.reset();
  }
}

exports.SamplerScheduler = SamplerScheduler;
