/* global Promise */

'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/native-promise', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var agentControls = require('../../../apps/agentStubControls');
  var NativePromiseControls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  var promiseControls = new NativePromiseControls({
    agentControls: agentControls
  });
  promiseControls.registerTestHooks();

  check('/delayed');
  check('/combined');
  check('/rejected');
  check('/childPromise');
  check('/childPromiseWithChildSend');
  check('/childHttpCall');
  check('/eventEmitterBased');

  function check(path, checker) {
    checker = checker || defaultChecker;

    it('must trace: ' + path, function() {
      // trigger tracing
      return (
        promiseControls
          .sendRequest({
            method: 'GET',
            path: path
          })

          // validate the data
          .then(function(spanContext) {
            return (
              utils
                .retry(function() {
                  return agentControls.getSpans().then(function(spans) {
                    checker(spanContext, spans, path);
                  });
                })

                // actionable error reporting
                .catch(function(error) {
                  return agentControls.getSpans().then(function(spans) {
                    // eslint-disable-next-line no-console
                    console.error(
                      'Span context %s does not match expectation.\n\nError: %s\n\nSpans: %s',
                      JSON.stringify(spanContext, 0, 2),
                      error,
                      JSON.stringify(spans, 0, 2)
                    );
                    return Promise.reject(error);
                  });
                })
            );
          })
      );
    });
  }

  function defaultChecker(spanContext, spans, path) {
    var entrySpan = getEntySpan(spans, path);
    expect(spanContext.t).to.equal(entrySpan.t);
    expect(spanContext.s).to.equal(entrySpan.s);
  }

  function getEntySpan(spans, path) {
    return utils.expectOneMatching(spans, function(span) {
      expect(span.p).to.equal(undefined);
      expect(span.n).to.equal('node.http.server');
      expect(span.data.http.url).to.equal(path);
    });
  }
});
