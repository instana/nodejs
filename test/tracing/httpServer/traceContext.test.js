'use strict';

var expect = require('chai').expect;
var leftpad = require('leftpad');

var supportedVersion = require('../../../src/tracing/index').supportedVersion;
var config = require('../../config');
var utils = require('../../utils');

describe('tracing/httpServer/traceContext', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var agentControls = require('../../apps/agentStubControls');
  var Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks({
    extraHeaders: ['UsEr-AgEnt']
  });

  describe('when disabled', function() {
    var controls = new Controls({
      agentControls: agentControls,
      env: {
        TRACE_CONTEXT_ENABLED: false
      }
    });
    controls.registerTestHooks();

    it('must not record incoming trace context', function() {
      var state = 'congo=BleGNlZWRzIHRohbCBwbGVhc3VyZS4=';
      return controls.sendRequest({
        method: 'GET',
        path: '/blub',
        headers: {
          traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
          tracestate: state
        }
      })
        .then(function() {
          return utils.retry(function() {
            return agentControls.getSpans()
            .then(function(spans) {
              utils.expectOneMatching(spans, function(span) {
                expect(span.data.traceContext).to.equal(undefined);
              });
            });
          });
        });
    });
  });

  describe('when enabled', function() {
    var controls = new Controls({
      agentControls: agentControls,
      env: {
        TRACE_CONTEXT_ENABLED: true
      }
    });
    controls.registerTestHooks();

    it('must record incoming trace context', function() {
      var state = 'congo=BleGNlZWRzIHRohbCBwbGVhc3VyZS4=';
      return controls.sendRequest({
        method: 'GET',
        path: '/blub',
        headers: {
          traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
          tracestate: state
        }
      })
        .then(function() {
          return utils.retry(function() {
            return agentControls.getSpans()
            .then(function(spans) {
              utils.expectOneMatching(spans, function(span) {
                expect(span.data.tc.s).to.deep.equal([
                  {k: 'in', v: '00-0af7651916cd43dd8448eb211c80319c-' + leftpad(span.s, 16, '0') + '-01'},
                  {k: 'congo', v: 'BleGNlZWRzIHRohbCBwbGVhc3VyZS4='}
                ]);
              });
            });
          });
        });
    });
  });
});
