'use strict';

const expect = require('chai').expect;
const semver = require('semver');

const config = require('../../../../core/test/config');
const testUtils = require('../../../../core/test/test_util');

describe('tracing/requireHook', function() {
  if (semver.lt(process.versions.node, '8.0.0')) {
    return;
  }

  const agentControls = require('../../apps/agentStubControls');
  const Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const controls = new Controls({
    agentControls
  });
  controls.registerTestHooks();

  describe('stealthy require', () => {
    it('must not apply caching when not necessary / or when something is fishy', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/requireRequestPromiseMultipleTimes'
        })
        .then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.data.http.status).to.equal(200);
              });
            })
          )
        ));
  });
});
