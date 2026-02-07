/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { Writable } = require('stream');
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const AsyncSampler = require('../../lib/samplers/async_sampler').AsyncSampler;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

class DevNull extends Writable {
  constructor(opts) {
    opts = opts || {};
    super(opts);
  }

  _write(chunk, encoding, cb) {
    setImmediate(cb);
  }
}

const devNull = new DevNull();

mochaSuiteFn('AsyncSampler', () => {
  let profiler;

  beforeEach(() => {
    profiler = global.profiler;
  });

  describe('extractFrames()', () => {
    it('should extract frames', done => {
      const sampler = new AsyncSampler(profiler);
      if (!sampler.test()) {
        done();
        return;
      }
      sampler.reset();

      function generateStackTrace(skip) {
        const orig = Error.prepareStackTrace;
        Error.prepareStackTrace = function (error, structuredStackTrace) {
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

      const sample = {
        asyncId: 1,
        stack: generateStackTrace(0)
      };

      sampler.samples = new Map();
      sampler.samples.set(1, sample);

      const frames = sampler.createStackTrace(sample, true);

      let found = false;
      frames.forEach(frame => {
        if (frame.getFileName().match(/async_sampler.test.js/)) {
          found = true;
        }
      });

      assert(found);

      done();
    });
  });

  describe('startProfiling()', () => {
    it('should record async profile', done => {
      const sampler = new AsyncSampler(profiler);
      if (!sampler.test()) {
        done();
        return;
      }
      sampler.reset();

      const server = http.createServer((req, res) => {
        fs.readFile('/tmp', () => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Hello World\n');
        });
      });

      let timer;
      server.listen(5001, '127.0.0.1', () => {
        // let startCpuTime = process.cpuUsage();
        sampler.startSampler();
        setTimeout(() => {
          sampler.stopSampler();
          const profile = sampler.buildProfile(1000, 10);
          assert(JSON.stringify(profile.toJson()).match(/async_sampler.test.js/));
          done();
        }, 1000);

        timer = setInterval(() => {
          http
            .get('http://localhost:5001', resp => {
              let data = '';

              resp.on('data', chunk => {
                data += chunk;
              });

              resp.on('end', () => {
                devNull.write(data);
              });
            })
            .on('error', err => {
              // eslint-disable-next-line no-console
              console.log('error', err.message);
            });
        }, 10);
      });

      setTimeout(() => {
        clearInterval(timer);
        server.close();
      }, 1000);
    });
  });
});
