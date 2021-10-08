/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable no-restricted-syntax */

'use strict';

const fs = require('fs');
const util = require('util');
const CallSite = require('../profile').CallSite;
const Profile = require('../profile').Profile;

class AsyncSampler {
  constructor(profiler) {
    this.EXCLUDE_SAMPLE_TYPES = {
      TIMERWRAP: true,
      Timeout: true,
      Immediate: true,
      TickObject: true,
      PROMISE: true
    };
    this.MAX_FRAMES = 50;
    this.SAMPLE_LIMIT = 500;

    this.profiler = profiler;
    this.top = undefined;
    this.profileDuration = undefined;
    this.spanStart = undefined;
    this.asyncHook = undefined;
    this.samples = undefined;
    this.sampleLimitReached = false;
  }

  test() {
    if (this.profiler.getOption('disableAsyncSampler')) {
      return false;
    }

    if (!this.profiler.matchVersion('v8.1.0', null)) {
      this.profiler.log('Async sampler is supported starting Node.js v8.1.0');
      return false;
    }

    return true;
  }

  initSampler() {
    const self = this;

    self.samples = new Map();

    // cannot use console.log based logging
    function error(err) {
      if (self.profiler.getOption('debug')) {
        fs.writeSync(2, `${self.profiler.logPrefix()} ${util.format(err)}\n`);
      }
    }

    function generateStackTrace(skip) {
      const orig = Error.prepareStackTrace;
      Error.prepareStackTrace = function (err, structuredStackTrace) {
        return structuredStackTrace;
      };

      const stack = new Error().stack;

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
        const sample = self.samples.get(asyncId);
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
    if (!this.asyncHook) {
      this.initSampler();
    }

    this.top = new CallSite(this.profiler, '', '', 0);
    this.profileDuration = 0;
  }

  startSampler() {
    this.sampleLimitReached = false;
    this.samples.clear();
    this.asyncHook.enable();
    this.spanStart = this.hrmillis();
  }

  stopSampler() {
    this.asyncHook.disable();

    // calculate actual record duration
    if (!this.sampleLimitReached) {
      this.profileDuration += this.hrmillis() - this.spanStart;
    } else {
      let spanEnd = this.spanStart;
      for (const sample of this.samples.values()) {
        if (sample.time) {
          const sampleEnd = sample.start + sample.time;
          if (sampleEnd > spanEnd) {
            spanEnd = sampleEnd;
          }
        }
      }

      if (spanEnd <= this.spanStart) {
        spanEnd = this.hrmillis();
      }

      this.profileDuration += spanEnd - this.spanStart;
    }

    this.updateProfile();

    this.samples.clear();
  }

  updateProfile() {
    const includeAgentFrames = this.profiler.getOption('includeAgentFrames');

    for (const sample of this.samples.values()) {
      if (!sample.time) {
        continue;
      }

      if (this.EXCLUDE_SAMPLE_TYPES[sample.type]) {
        continue;
      }

      let frames = this.createStackTrace(sample, includeAgentFrames);
      if (frames.length === 0) {
        continue;
      }
      frames = frames.reverse();

      // update profile
      let node = this.top;
      for (const frame of frames) {
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
    const frames = new Map();
    const processed = new Set();

    while (sample && !processed.has(sample.asyncId)) {
      processed.add(sample.asyncId);

      if (sample.stack) {
        this.extractFrames(frames, sample.stack, includeAgentFrames);
        if (frames.size > this.MAX_FRAMES) {
          break;
        }
      }

      sample = this.samples.get(sample.triggerAsyncId);
    }

    return Array.from(frames.values());
  }

  extractFrames(frames, stack, includeAgentFrames) {
    if (!includeAgentFrames) {
      let profilerStack = false;
      stack.forEach(frame => {
        if (this.profiler.AGENT_FRAME_REGEXP.exec(frame.getFileName())) {
          profilerStack = true;
        }
      });
      if (profilerStack) {
        return;
      }
    }

    stack.forEach(frame => {
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
    const roots = new Set();
    for (const child of this.top.children.values()) {
      roots.add(child);
    }

    const profile = new Profile(
      this.profiler,
      Profile.c.CATEGORY_TIME,
      Profile.c.TYPE_ASYNC_CALLS,
      Profile.c.UNIT_MILLISECOND,
      roots,
      duration,
      timespan
    );

    return profile;
  }

  hrmillis() {
    const t = process.hrtime();
    return t[0] * 1e3 + t[1] / 1e6;
  }
}

exports.AsyncSampler = AsyncSampler;
