/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

class SamplerScheduler {
  constructor(profiler, sampler, config) {
    this.profiler = profiler;
    this.sampler = sampler;
    this.config = config;
    this.started = false;
    this.spanTimer = undefined;
    this.randomTimer = undefined;
    this.reportTimer = undefined;
    this.profileStartTs = undefined;
    this.profileDuration = undefined;
  }

  start() {
    if (!this.sampler.test()) {
      return;
    }

    if (this.started) {
      return;
    }
    this.started = true;

    this.reset();

    if (!this.profiler.getOption('disableTimers')) {
      this.spanTimer = this.profiler.setInterval(() => {
        this.randomTimer = this.profiler.setTimeout(() => {
          this.profile(false, true);
        }, Math.round(Math.random() * (this.config.spanInterval - this.config.maxSpanDuration)));
      }, this.config.spanInterval);

      this.reportTimer = this.profiler.setInterval(() => {
        this.report();
      }, this.config.reportInterval);
    }
  }

  stop() {
    if (!this.started) {
      return;
    }
    this.started = false;

    if (this.spanTimer) {
      clearInterval(this.spanTimer);
      this.spanTimer = undefined;
    }

    if (this.randomTimer) {
      clearTimeout(this.randomTimer);
      this.randomTimer = undefined;
    }

    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = undefined;
    }
  }

  reset() {
    this.sampler.reset();
    this.profileStartTs = Date.now();
    this.profileDuration = 0;
  }

  profile() {
    if (!this.started) {
      return null;
    }

    if (this.profileDuration > this.config.maxProfileDuration) {
      this.profiler.debug(this.config.logPrefix + ': max profiling duration reached.');
      return null;
    }

    if (this.profiler.samplerActive) {
      this.profiler.debug(this.config.logPrefix + ': sampler lock exists.');
      return null;
    }
    this.profiler.samplerActive = true;
    this.profiler.debug(this.config.logPrefix + ': started.');

    try {
      this.sampler.startSampler();
    } catch (err) {
      this.profiler.samplerActive = false;
      this.profiler.exception(err);
      return null;
    }

    const spanStart = Date.now();

    let stopped = false;
    const self = this;
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

    if (!this.profiler.getOption('disableTimers')) {
      this.profiler.setTimeout(() => {
        _stop();
      }, this.config.maxSpanDuration);
    } else {
      return {
        stop: function () {
          _stop();
        }
      };
    }
  }

  report() {
    if (!this.started) {
      return;
    }

    if (this.profileDuration === 0) {
      return;
    }

    if (this.profileStartTs > Date.now() - this.config.reportInterval) {
      return;
    } else if (this.profileStartTs < Date.now() - 2 * this.config.reportInterval) {
      this.reset();
      return;
    }
    this.profiler.debug(this.config.logPrefix + ': reporting profile.');

    const profile = this.sampler.buildProfile(this.profileDuration, Date.now() - this.profileStartTs);

    const externalPid = this.profiler.getExternalPid();
    if (externalPid) {
      profile.processId = '' + externalPid;
    }

    this.profiler.profileRecorder.record(profile.toJson());

    this.reset();
  }
}

exports.SamplerScheduler = SamplerScheduler;
