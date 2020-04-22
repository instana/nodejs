'use strict';


class ProfileRecorder {
  constructor(profiler) {
    let self = this;

    self.FLUSH_INTERVAL = 5 * 1000;
    self.MAX_BUFFERED_PROFILES = 100;

    self.profiler = profiler;
    self.queue = undefined;
    self.flushTimer = undefined;
    self.backoffSeconds = undefined;
    self.lastFlushTs = undefined;
  }


  start() {
    let self = this;

    self.reset();

    self.flushTimer = self.profiler.setInterval(function() {
      self.flush((err) => {
        if (err) {
          self.profiler.error('Error uploading messages');
          self.profiler.exception(err);
        }
      });
    }, self.FLUSH_INTERVAL);
  }


  stop() {
    let self = this;

    if (self.flushTimer) {
      clearInterval(self.flushTimer);
      self.flushTimer = undefined;
    }
  }


  reset() {
    let self = this;

    self.backoffSeconds = 0;
    self.lastFlushTs = Date.now();
    self.queue = [];
  }


  record(profile) {
    let self = this;

    self.queue.push(profile);

    // cleanup queue
    if (self.queue.length > self.profiler.getOption('maxBufferedProfiles')) {
      self.queue = self.queue.shift();
    }

    self.profiler.debug('Added a record profile to the queue');
  }


  flush(callback) {
    let self = this;

    let now = Date.now();

    if (self.queue.length === 0) {
      return callback(null);
    }

    // flush only if backoff time is elapsed
    if (self.lastFlushTs + self.backoffSeconds * 1000 > now) {
      return callback(null);
    }

    // read queue
    let outgoing = self.queue;
    self.queue = [];

    self.lastFlushTs = now;
    self.profiler.sendProfiles(outgoing, function(err) {
      if (err) {
        self.profiler.error('Error sending profiles to the host agent, backing off next upload');
        self.profiler.exception(err);

        self.queue = outgoing.concat(self.queue);

        // increase backoff up to 1 minute
        if (self.backoffSeconds === 0) {
          self.backoffSeconds = 10;
        } else if (self.backoffSeconds * 2 < 60) {
          self.backoffSeconds *= 2;
        }

        callback(err);
      } else {
        // reset backoff
        self.backoffSeconds = 0;

        callback(null);
      }
    });
  }
}

exports.ProfileRecorder = ProfileRecorder;
