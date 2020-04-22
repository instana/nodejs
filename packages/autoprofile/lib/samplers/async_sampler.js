'use strict';

const fs = require('fs');
const util = require('util');
const CallSite = require('../profile').CallSite;
const Profile = require('../profile').Profile;



class AsyncSampler {
  constructor(profiler) {
    let self = this;

    self.EXCLUDE_SAMPLE_TYPES = {
      TIMERWRAP: true,
      Timeout: true,
      Immediate: true,
      TickObject: true,
      PROMISE: true
    };
    self.MAX_FRAMES = 50;
    self.SAMPLE_LIMIT = 500;

    self.profiler = profiler;
    self.top = undefined;
    self.profileDuration = undefined;
    self.spanStart = undefined;
    self.asyncHook = undefined;
    self.samples = undefined;
    self.sampleLimitReached = false;
  }


  test() {
    let self = this;

    if (self.profiler.getOption('asyncSamplerDisabled')) {
      return false;
    }

    if (!self.profiler.matchVersion('v8.1.0', null)) {
      self.profiler.log('Async sampler is supported starting Node.js v8.1.0');
      return false;
    }

    return true;
  }


  initSampler() {
    let self = this;

    self.samples = new Map();

    // cannot use console.log based logging
    function error(err) {
      if (self.profiler.getOption('debug')) {
        fs.writeSync(2, `${self.profiler.logPrefix()} ${util.format(err)}\n`);
      }
    }

    function generateStackTrace(skip) {
      var orig = Error.prepareStackTrace;
      Error.prepareStackTrace = function(err, structuredStackTrace) {
        return structuredStackTrace;
      };

      var stack = new Error().stack;

      Error.prepareStackTrace = orig;

      if (stack) {
        return stack.slice(skip);
      } else {
        return null;
      }
    }


    function init(asyncId, type, triggerAsyncId) {
      try {
        if (self.sampleLimitReached) {
          return;
        }

        if (self.samples.size >= self.SAMPLE_LIMIT) {
          self.sampleLimitReached = true;
          return;
        }

        self.samples.set(asyncId, {
          asyncId: asyncId,
          triggerAsyncId: triggerAsyncId,
          type: type,
          start: self.hrmillis(),
          stack: generateStackTrace(3),
          time: null
        });
      } catch (err) {
        error(err);
      }
    }


    function before(asyncId) {
      try {
        let sample = self.samples.get(asyncId);
        if (!sample) {
          return;
        }

        sample.time = self.hrmillis() - sample.start;
      } catch (err) {
        error(err);
      }
    }

    const asyncHooks = require('async_hooks');
    self.asyncHook = asyncHooks.createHook({ init, before });
  }


  reset() {
    let self = this;

    if (!self.asyncHook) {
      self.initSampler();
    }

    self.top = new CallSite(self.profiler, '', '', 0);
    self.profileDuration = 0;
  }


  startSampler() {
    let self = this;

    self.sampleLimitReached = false;
    self.samples.clear();
    self.asyncHook.enable();
    self.spanStart = self.hrmillis();
  }


  stopSampler() {
    let self = this;

    self.asyncHook.disable();

    // calculate actual record duration
    if (!self.sampleLimitReached) {
      self.profileDuration += self.hrmillis() - self.spanStart;
    } else {
      let spanEnd = self.spanStart;
      for (let sample of self.samples.values()) {
        if (sample.time) {
          let sampleEnd = sample.start + sample.time;
          if (sampleEnd > spanEnd) {
            spanEnd = sampleEnd;
          }
        }
      }

      if (spanEnd <= self.spanStart) {
        spanEnd = self.hrmillis();
      }

      self.profileDuration += spanEnd - self.spanStart;
    }

    self.updateProfile();

    self.samples.clear();
  }


  updateProfile() {
    let self = this;

    let includeAgentFrames = self.profiler.getOption('includeAgentFrames');

    for (let sample of self.samples.values()) {
      if (!sample.time) {
        continue;
      }

      if (self.EXCLUDE_SAMPLE_TYPES[sample.type]) {
        continue;
      }

      let frames = self.createStackTrace(sample, includeAgentFrames);
      if (frames.length === 0) {
        continue;
      }
      frames = frames.reverse();


      // update profile
      let node = self.top;
      for (let frame of frames) {
        let methodName = '';
        if (frame.getFunctionName()) {
          methodName = frame.getFunctionName();
        }
        if (frame.getMethodName()) {
          methodName += ` [as ${frame.getMethodName()}]`;
        }
        node = node.findOrAddChild(methodName, frame.getFileName(), frame.getLineNumber());
      }

      node.measurement += sample.time;
      node.numSamples += 1;
    }
  }


  createStackTrace(sample, includeAgentFrames) {
    let self = this;

    let frames = new Map();
    let processed = new Set();

    while (sample && !processed.has(sample.asyncId)) {
      processed.add(sample.asyncId);

      if (sample.stack) {
        self.extractFrames(frames, sample.stack, includeAgentFrames);
        if (frames.size > self.MAX_FRAMES) {
          break;
        }
      }

      sample = self.samples.get(sample.triggerAsyncId);
    }

    return Array.from(frames.values());
  }


  extractFrames(frames, stack, includeAgentFrames) {
    let self = this;

    if (!includeAgentFrames) {
      let profilerStack = false;
      stack.forEach((frame) => {
        if (self.profiler.AGENT_FRAME_REGEXP.exec(frame.getFileName())) {
          profilerStack = true;
        }
      });
      if (profilerStack) {
        return;
      }
    }

    stack.forEach((frame) => {
      let key = '';
      if (frame.getFunctionName()) {
        key = frame.getFunctionName();
      }
      if (frame.getMethodName()) {
        key += ` [as ${frame.getMethodName()}]`;
      }
      if (frame.getFileName()) {
        key += ` (${frame.getFileName()}:${frame.getLineNumber()}:${frame.getColumnNumber()})`;
      }

      if (key && !frames.has(key)) {
        frames.set(key, frame);
      }
    });
  }


  buildProfile(duration, timespan) {
    let self = this;

    let roots = new Set();
    for (let child of self.top.children.values()) {
      roots.add(child);
    }

    let profile = new Profile(
      self.profiler,
      Profile.c.CATEGORY_TIME,
      Profile.c.TYPE_ASYNC_CALLS,
      Profile.c.UNIT_MILLISECOND,
      roots,
      duration,
      timespan);

    return profile;
  }


  hrmillis() {
    const t = process.hrtime();
    return t[0] * 1e3 + t[1] / 1e6;
  }
}

exports.AsyncSampler = AsyncSampler;
