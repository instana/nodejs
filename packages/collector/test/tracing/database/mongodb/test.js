'use strict';

const expect = require('chai').expect;
const Promise = require('bluebird');
const _ = require('lodash');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../config');
const utils = require('../../../utils');

describe('tracing/mongodb', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const expressMongodbControls = require('./controls');
  const agentStubControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressMongodbControls.registerTestHooks();

  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressMongodbControls.getPid()));

  it('must trace insert requests', () =>
    expressMongodbControls
      .sendRequest({
        method: 'POST',
        path: '/insert',
        body: {
          foo: 'bar'
        }
      })
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.peer.hostname).to.equal('127.0.0.1');
              expect(span.data.peer.port).to.equal(27017);
              expect(span.data.mongo.command).to.equal('insert');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('myproject.mydocs');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
              expect(span.data.http.status).to.equal(200);
            });
          })
        )
      ));

  it('must trace find requests', () =>
    expressMongodbControls
      .sendRequest({
        method: 'POST',
        path: '/find',
        body: {
          bla: 'blub'
        }
      })
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.peer.hostname).to.equal('127.0.0.1');
              expect(span.data.peer.port).to.equal(27017);
              expect(span.data.mongo.command).to.equal('find');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('myproject.mydocs');
              expect(span.data.mongo.filter).to.deep.equal(
                JSON.stringify({
                  bla: 'blub'
                })
              );
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
              expect(span.data.http.status).to.equal(200);
            });
          })
        )
      ));

  // regression test for https://instana.zendesk.com/agent/tickets/5263
  it('must not corrupt traces by adding unrelated entries', () =>
    expressMongodbControls
      .sendRequest({
        method: 'POST',
        path: '/long-find',
        body: {
          fitze: 'fatze'
        }
      })
      // Add a little delay (smaller than the delay in app.js, so it will happen while that trace is still active).
      .then(
        () =>
          new Promise(resolve => {
            setTimeout(resolve, 100);
          })
      )
      // Trigger another HTTP request, this one must _not_ appear in the first trace triggered by POST /long-find.
      .then(() =>
        expressMongodbControls.sendRequest({
          method: 'GET',
          path: '/ping'
        })
      )
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const actualEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.url).to.equal('/long-find');
              expect(span.data.http.method).to.equal('POST');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.p).to.not.exist;
            });

            // check that the other entry span is unrelated
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.url).to.equal('/ping');
              expect(span.data.http.method).to.equal('GET');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.t).to.not.equal(actualEntrySpan.t);
              expect(span.p).to.not.exist;
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(actualEntrySpan.t);
              expect(span.p).to.equal(actualEntrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.peer.hostname).to.equal('127.0.0.1');
              expect(span.data.peer.port).to.equal(27017);
              expect(span.data.mongo.command).to.equal('find');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('myproject.mydocs');
              expect(span.data.mongo.filter).to.deep.equal(
                JSON.stringify({
                  fitze: 'fatze'
                })
              );
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(actualEntrySpan.t);
              expect(span.p).to.equal(actualEntrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
              expect(span.data.http.status).to.equal(200);
            });
          })
        )
      ));

  it('must trace find requests with cursors', () =>
    Promise.all(
      _.range(10).map(i =>
        expressMongodbControls.sendRequest({
          method: 'POST',
          path: '/insert',
          body: {
            type: `foobar-${i}`
          }
        })
      )
    )
      .then(() => Promise.delay(1000))
      .then(agentStubControls.clearRetrievedData)
      .then(() =>
        expressMongodbControls.sendRequest({
          method: 'GET',
          path: '/findall'
        })
      )
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.url).to.equal('/findall');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.peer.hostname).to.equal('127.0.0.1');
              expect(span.data.peer.port).to.equal(27017);
              expect(span.data.mongo.command).to.equal('find');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('myproject.mydocs');
              expect(span.data.mongo.filter).to.deep.equal('{}');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.peer.hostname).to.equal('127.0.0.1');
              expect(span.data.peer.port).to.equal(27017);
              expect(span.data.mongo.command).to.equal('getMore');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('myproject.mydocs');
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
              expect(span.data.http.status).to.equal(200);
            });
          })
        )
      ));
});
