'use strict';

const expect = require('chai').expect;
const semver = require('semver');

const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');

describe('tracing/requireHook', function() {
  if (semver.lt(process.versions.node, '8.0.0')) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const controls = new ProcessControls({
    dirname: __dirname,
    agentControls
  }).registerTestHooks();

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
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.data.http.status).to.equal(200)
              ]);
            })
          )
        ));
  });
});
