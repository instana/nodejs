'use strict';

const AsyncSampler = require('../../lib/samplers/async_sampler').AsyncSampler;

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const util = require('util');


describe('AsyncSampler', () => {
  let profiler;

  beforeEach(() => {
    profiler = global.profiler;
  });

  describe('extractFrames()', () => {
    it('should extract frames', (done) => {
      let sampler = new AsyncSampler(profiler);
      if (!sampler.test()) {
        done();
        return;
      }
      sampler.reset();

      function generateStackTrace(skip) {
        var orig = Error.prepareStackTrace;
        Error.prepareStackTrace = function(error, structuredStackTrace) {
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

      let sample = {
        asyncId: 1,
        stack: generateStackTrace(0)
      };

      sampler.samples = new Map();
      sampler.samples.set(1, sample);

      let frames = sampler.createStackTrace(sample, true);

      let found = false;
      for (let frame of frames) {
        if (frame.getFileName().match(/async_sampler.test.js/)) {
          found = true;
        }
      }

      assert(found);

      done();
    });
  });


  describe('startProfiling()', () => {
    it('should record async profile', (done) => {
      let sampler = new AsyncSampler(profiler);
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
          let profile = sampler.buildProfile(1000, 10);

          // let endCpuTime = process.cpuUsage(startCpuTime)
          // console.log('CPU time:', (endCpuTime.user + endCpuTime.system) / 1e6);

          // console.log(profiles[0].profile.dump());
          assert(JSON.stringify(profile.toJson()).match(/async_sampler.test.js/));

          done();
        }, 1000);

        timer = setInterval(() => {
          http.get('http://localhost:5001', (resp) => {
            let data = '';

            resp.on('data', (chunk) => {
              data += chunk;
            });

            resp.on('end', () => {
            });
          }).on('error', (err) => {
            console.log('Error: ' + err.message);
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
