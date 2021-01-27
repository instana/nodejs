/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

class ProfileRecorder {
  constructor(profiler) {
    this.FLUSH_INTERVAL = 5 * 1000;
    this.MAX_BUFFERED_PROFILES = 100;

    this.profiler = profiler;
    this.queue = undefined;
    this.flushTimer = undefined;
    this.backoffSeconds = undefined;
    this.lastFlushTs = undefined;
  }

  start() {
    const self = this;

    this.reset();

    if (!this.profiler.getOption('disableTimers')) {
      this.flushTimer = this.profiler.setInterval(() => {
        self.flush(err => {
          if (err) {
            self.profiler.error('Error uploading messages');
            self.profiler.exception(err);
          }
        });
      }, this.FLUSH_INTERVAL);
    }
  }

  stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  reset() {
    this.backoffSeconds = 0;
    this.lastFlushTs = Date.now();
    this.queue = [];
  }

  record(profile) {
    this.queue.push(profile);

    // cleanup queue
    if (this.queue.length > this.profiler.getOption('maxBufferedProfiles')) {
      this.queue = this.queue.shift();
    }

    this.profiler.debug('Added a profile record to the queue');
  }

  flush(callback) {
    const now = Date.now();

    if (this.queue.length === 0) {
      return callback(null);
    }

    // flush only if backoff time is elapsed
    if (this.lastFlushTs + this.backoffSeconds * 1000 > now) {
      return callback(null);
    }

    // read queue
    const outgoing = this.queue;
    this.queue = [];

    this.lastFlushTs = now;
    this.profiler.sendProfiles(outgoing, err => {
      if (err) {
        this.profiler.error('Error sending profiles to the host agent, backing off next upload');
        this.profiler.exception(err);

        this.queue = outgoing.concat(this.queue);

        // increase backoff up to 1 minute
        if (this.backoffSeconds === 0) {
          this.backoffSeconds = 10;
        } else if (this.backoffSeconds * 2 < 60) {
          this.backoffSeconds *= 2;
        }

        callback(err);
      } else {
        // reset backoff
        this.backoffSeconds = 0;

        callback(null);
      }
    });
  }
}

exports.ProfileRecorder = ProfileRecorder;
