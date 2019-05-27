'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../config');
const utils = require('../../../utils');

describe('tracing/http server', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');
  const Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks({
    extraHeaders: ['UsEr-AgEnt'],
    secretsList: ['secret', 'Enigma', 'CIPHER']
  });

  const controls = new Controls({
    agentControls
  });
  controls.registerTestHooks();

  it('must report additional headers when requested', () => {
    const userAgent = 'medivhTheTeleporter';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/',
        headers: {
          'User-Agent': userAgent
        }
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.header['user-agent']).to.equal(userAgent);
            });
          })
        )
      );
  });

  it('must remove secrets from query parameters', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/?param1=value1&TheSecreT=classified&param2=value2&enIgmAtic=occult&param3=value4&cipher=veiled'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.params).to.equal('param1=value1&param2=value2&param3=value4');
            });
          })
        )
      ));
});
