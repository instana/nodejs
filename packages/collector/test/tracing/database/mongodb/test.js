'use strict';

const expect = require('chai').expect;
const Promise = require('bluebird');
const uuid = require('uuid/v4');
const _ = require('lodash');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const utils = require('../../../../../core/test/utils');

describe('tracing/mongodb', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const controls = require('./controls');
  const agentStubControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  controls.registerTestHooks();

  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(controls.getPid()));

  it('must trace insert requests', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/insert-one',
        body: {
          foo: 'bar'
        }
      })
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpan = expectHttpEntry(spans, '/insert-one');
            expectMongoExit(spans, entrySpan, 'insert');
            expectHttpExit(spans, entrySpan);
          })
        )
      ));

  it('must trace update requests', () => {
    const unique = uuid();
    return insertDoc(unique)
      .then(() =>
        controls.sendRequest({
          method: 'POST',
          path: '/update-one',
          body: {
            filter: { unique },
            update: {
              $set: {
                content: 'updated content'
              }
            }
          }
        })
      )
      .then(() => findDoc(unique))
      .then(response => {
        expect(response._id).to.exist;
        expect(response.unique).to.equal(unique);
        expect(response.content).to.equal('updated content');
        return utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpanUpdate = expectHttpEntry(spans, '/update-one');
            expectMongoExit(
              spans,
              entrySpanUpdate,
              'update',
              null,
              null,
              JSON.stringify([
                {
                  q: {
                    unique
                  },
                  u: {
                    $set: {
                      content: 'updated content'
                    }
                  },
                  upsert: false,
                  multi: false
                }
              ])
            );
            expectHttpExit(spans, entrySpanUpdate);
          })
        );
      });
  });

  it('must trace replace requests', () => {
    const unique = uuid();
    return insertDoc(unique)
      .then(() =>
        controls.sendRequest({
          method: 'POST',
          path: '/replace-one',
          body: {
            filter: { unique },
            doc: {
              unique,
              somethingElse: 'replaced'
            }
          }
        })
      )
      .then(() => findDoc(unique))
      .then(response => {
        expect(response._id).to.exist;
        expect(response.unique).to.equal(unique);
        expect(response.somethingElse).to.equal('replaced');
        return utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpanUpdate = expectHttpEntry(spans, '/replace-one');
            expectMongoExit(
              spans,
              entrySpanUpdate,
              'update',
              null,
              null,
              JSON.stringify([
                {
                  q: {
                    unique
                  },
                  u: {
                    unique,
                    somethingElse: 'replaced'
                  },
                  upsert: false,
                  multi: false
                }
              ])
            );
            expectHttpExit(spans, entrySpanUpdate);
          })
        );
      });
  });

  it('must trace delete requests', () => {
    const unique = uuid();
    return insertDoc(unique)
      .then(() =>
        controls.sendRequest({
          method: 'POST',
          path: '/delete-one',
          body: {
            filter: { unique }
          }
        })
      )
      .then(() => findDoc(unique))
      .then(response => {
        expect(response).to.not.exist;
        return utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpanUpdate = expectHttpEntry(spans, '/delete-one');
            expectMongoExit(
              spans,
              entrySpanUpdate,
              'delete',
              null,
              null,
              JSON.stringify([
                {
                  q: {
                    unique
                  },
                  limit: 1
                }
              ])
            );
            expectHttpExit(spans, entrySpanUpdate);
          })
        );
      });
  });

  it('must trace find requests', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/find-one',
        body: {
          bla: 'blub'
        }
      })
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpan = expectHttpEntry(spans, '/find-one');
            expectMongoExit(
              spans,
              entrySpan,
              'find',
              JSON.stringify({
                bla: 'blub'
              })
            );
            expectHttpExit(spans, entrySpan);
          })
        )
      ));

  // regression test for https://instana.zendesk.com/agent/tickets/5263
  it('must not corrupt traces by adding unrelated entries', () =>
    controls
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
        controls.sendRequest({
          method: 'GET',
          path: '/ping'
        })
      )
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpan = expectHttpEntry(spans, '/long-find');

            // check that the other entry span is unrelated
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.url).to.equal('/ping');
              expect(span.data.http.method).to.equal('GET');
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.t).to.not.equal(entrySpan.t);
              expect(span.p).to.not.exist;
            });

            expectMongoExit(
              spans,
              entrySpan,
              'find',
              JSON.stringify({
                fitze: 'fatze'
              })
            );

            expectHttpExit(spans, entrySpan);
          })
        )
      ));

  it('must trace find requests with cursors', () =>
    Promise.all(
      _.range(10).map(i =>
        controls.sendRequest({
          method: 'POST',
          path: '/insert-one',
          body: {
            type: `foobar-${i}`
          }
        })
      )
    )
      .then(() => Promise.delay(1000))
      .then(agentStubControls.clearRetrievedData)
      .then(() =>
        controls.sendRequest({
          method: 'GET',
          path: '/findall'
        })
      )
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpan = expectHttpEntry(spans, '/findall');
            expectMongoExit(spans, entrySpan, 'find', '{}');
            expectMongoExit(spans, entrySpan, 'getMore');
            expectHttpExit(spans, entrySpan);
          })
        )
      ));

  function insertDoc(unique) {
    return controls.sendRequest({
      method: 'POST',
      path: '/insert-one',
      body: {
        unique,
        content: 'some content'
      }
    });
  }

  function findDoc(unique) {
    return controls.sendRequest({
      method: 'GET',
      path: '/find-one',
      body: {
        unique
      }
    });
  }

  function expectHttpEntry(spans, url) {
    return utils.expectOneMatching(spans, span => {
      expect(span.n).to.equal('node.http.server');
      expect(span.p).to.not.exist;
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      expect(span.error).to.equal(false);
      expect(span.data.http.url).to.equal(url);
    });
  }

  function expectMongoExit(spans, parentSpan, command, filter, query, json) {
    return utils.expectOneMatching(spans, span => {
      expect(span.t).to.equal(parentSpan.t);
      expect(span.p).to.equal(parentSpan.s);
      expect(span.n).to.equal('mongo');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      expect(span.error).to.equal(false);
      expect(span.data.peer.hostname).to.equal('127.0.0.1');
      expect(span.data.peer.port).to.equal(27017);
      expect(span.data.mongo.command).to.equal(command);
      expect(span.data.mongo.service).to.equal(process.env.MONGODB);
      expect(span.data.mongo.namespace).to.equal('myproject.mydocs');
      if (filter != null) {
        expect(span.data.mongo.filter).to.equal(filter);
      } else {
        expect(span.data.mongo.filter).to.not.exist;
      }
      if (query != null) {
        expect(span.data.mongo.query).to.equal(query);
      } else {
        expect(span.data.mongo.query).to.not.exist;
      }
      if (json != null) {
        expect(span.data.mongo.json).to.equal(json);
      } else {
        expect(span.data.mongo.json).to.not.exist;
      }
    });
  }

  function expectHttpExit(spans, parentSpan) {
    return utils.expectOneMatching(spans, span => {
      expect(span.t).to.equal(parentSpan.t);
      expect(span.p).to.equal(parentSpan.s);
      expect(span.n).to.equal('node.http.client');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      expect(span.error).to.equal(false);
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
      expect(span.data.http.status).to.equal(200);
    });
  }
});
