'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const path = require('path');
const fs = require('fs');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const cpu = require('../../../src/actions/profiling/cpu');
const config = require('../../../../core/test/config');
const testUtils = require('../../../../core/test/test_util');
const ProcessControls = require('../../tracing/ProcessControls');

describe('actions/profiling/cpu', () => {
  if (!semver.satisfies(process.versions.node, '>=4.0.0')) {
    return;
  }

  describe('toTreeWithTiming', () => {
    let rawCpuProfile;

    beforeEach(() => {
      rawCpuProfile = JSON.parse(fs.readFileSync(path.join(__dirname, 'cpuProfile.json'), { encoding: 'utf8' }));
    });

    it('must turn the raw CPU profile into a tree with timing information', () => {
      const root = cpu.toTreeWithTiming(rawCpuProfile, 1000);
      expect(root.f).to.equal('(root)');

      const firstChild = root.c[0];
      expect(firstChild.f).to.equal('');
      expect(firstChild.u).to.equal('node.js');
      expect(firstChild.l).to.equal(10);
    });

    it('must calculate timing information based on sampling interval', () => {
      const root = cpu.toTreeWithTiming(rawCpuProfile, 100);
      expect(root.sh).to.equal(0);
      expect(root.th).to.equal(3799);

      expect(root.s).to.equal(0);
      expect(root.t).to.equal(3799000);
    });

    it('must shorten bailout reasons', () => {
      const firstChild = cpu.toTreeWithTiming(rawCpuProfile, 100).c[0];
      expect(firstChild.b).to.equal(undefined);
    });
  });

  describe('integration-test', function() {
    if (semver.satisfies(process.versions.node, '>=12.0.0')) {
      // Skipping test, v8-profiler-node8 needs to be updated for Node.js 12.
      return;
    }

    this.timeout(config.getTestTimeout());

    const agentControls = require('../../apps/agentStubControls');
    agentControls.registerTestHooks();
    const controls = new ProcessControls({
      appPath: path.join(__dirname, '..', '..', 'tracing', 'database', 'elasticsearch_legacy', 'app'),
      agentControls
    }).registerTestHooks({
      enableTracing: supportedVersion(process.versions.node)
    });

    it('must inform about start of CPU profile', () => {
      const messageId = 'a';
      return agentControls
        .addRequestForPid(controls.getPid(), {
          action: 'node.startCpuProfiling',
          messageId,
          args: {
            duration: 1000
          }
        })
        .then(() =>
          testUtils.retry(() =>
            agentControls.getResponses().then(responses => {
              testUtils.expectAtLeastOneMatching(responses, response => {
                expect(response.messageId).to.equal(messageId);
                expect(response.data.data).to.match(/Profiling successfully started/i);
              });

              testUtils.expectAtLeastOneMatching(responses, response => {
                expect(response.messageId).to.equal(messageId);
                expect(response.data.data.f).to.equal('(root)');
                expect(response.data.data.sh).to.equal(0);
                expect(response.data.data.th).to.be.above(0);
                expect(response.data.data.t).to.equal(response.data.data.th * 1000);
              });
            })
          )
        );
    });

    it('must stop running CPU profiles and provide the results', () => {
      const startMessageId = 'start';
      const stopMessageId = 'stop';
      return agentControls
        .addRequestForPid(controls.getPid(), {
          action: 'node.startCpuProfiling',
          messageId: startMessageId,
          args: {
            duration: 6000000
          }
        })
        .then(() =>
          agentControls.addRequestForPid(controls.getPid(), {
            action: 'node.stopCpuProfiling',
            messageId: stopMessageId,
            args: {}
          })
        )
        .then(() =>
          testUtils.retry(() =>
            agentControls.getResponses().then(responses => {
              testUtils.expectAtLeastOneMatching(responses, response => {
                expect(response.messageId).to.equal(stopMessageId);
                expect(response.data.data).to.match(/CPU profiling successfully stopped/i);
              });

              testUtils.expectAtLeastOneMatching(responses, response => {
                expect(response.messageId).to.equal(startMessageId);
                expect(response.data.data).to.match(/Profiling successfully started/i);
              });

              testUtils.expectAtLeastOneMatching(responses, response => {
                expect(response.messageId).to.equal(startMessageId);
                expect(response.data.data.f).to.equal('(root)');
              });
            })
          )
        );
    });

    it('must abort running CPU profiles', () => {
      const startMessageId = 'start';
      const stopMessageId = 'stop';
      return agentControls
        .addRequestForPid(controls.getPid(), {
          action: 'node.startCpuProfiling',
          messageId: startMessageId,
          args: {
            duration: 6000000
          }
        })
        .then(() =>
          agentControls.addRequestForPid(controls.getPid(), {
            action: 'node.stopCpuProfiling',
            messageId: stopMessageId,
            args: {
              abort: true
            }
          })
        )
        .then(() =>
          testUtils.retry(() =>
            agentControls.getResponses().then(responses => {
              testUtils.expectAtLeastOneMatching(responses, response => {
                expect(response.messageId).to.equal(stopMessageId);
                expect(response.data.data).to.match(/CPU profiling successfully aborted/i);
              });

              testUtils.expectAtLeastOneMatching(responses, response => {
                expect(response.messageId).to.equal(startMessageId);
                expect(response.data.data).to.match(/Profiling successfully started/i);
              });
            })
          )
        );
    });

    it('must do nothing when there is no active CPU profile', () => {
      const stopMessageId = 'stop';
      return agentControls
        .addRequestForPid(controls.getPid(), {
          action: 'node.stopCpuProfiling',
          messageId: stopMessageId,
          args: {
            abort: true
          }
        })
        .then(() =>
          testUtils.retry(() =>
            agentControls.getResponses().then(responses => {
              testUtils.expectAtLeastOneMatching(responses, response => {
                expect(response.messageId).to.equal(stopMessageId);
                expect(response.data.data).to.match(/No active CPU profiling session found/i);
              });
            })
          )
        );
    });
  });
});
