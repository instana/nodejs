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

  // originally, this was intended as potential regression test for
  // - https://instana.zendesk.com/agent/tickets/5263 and
  // - https://instana.zendesk.com/agent/tickets/11530
  // (but it does not quite reproduce the symptoms)..
  it('must not corrupt traces by adding unrelated entries', () => {
    const unique = uuid();
    const firstRequest = controls.sendRequest({
      method: 'POST',
      path: `/long-find?call=1&unique=${unique}`
    });
    const secondRequest = new Promise(resolve => {
      // Add a little delay (smaller than the delay in app.js, so it will happen while that trace is still active).
      setTimeout(resolve, 750);
    }).then(() =>
      // Trigger another HTTP request, this one must _not_ appear in the first trace triggered by POST /long-find.
      controls.sendRequest({
        method: 'POST',
        path: `/long-find?call=2&unique=${unique}`
      })
    );

    return insertDoc(unique)
      .then(() => Promise.all([firstRequest, secondRequest]))
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpan1 = expectHttpEntry(spans, '/long-find', `call=1&unique=${unique}`);
            const entrySpan2 = expectHttpEntry(spans, '/long-find', `call=2&unique=${unique}`);

            expect(entrySpan1.t).to.not.equal(entrySpan2.t);

            expect(entrySpan1.p).to.not.exist;
            expectMongoExit(
              spans,
              entrySpan1,
              'find',
              JSON.stringify({
                unique
              })
            );
            expectHttpExit(spans, entrySpan1, 'call=1');

            expect(entrySpan2.p).to.not.exist;
            expectMongoExit(
              spans,
              entrySpan2,
              'find',
              JSON.stringify({
                unique
              })
            );
            expectHttpExit(spans, entrySpan2, 'call=2');
          })
        )
      );
  });

  it('must trace find requests with cursors', () => {
    const unique = uuid();
    return Promise.all(
      _.range(10).map(i =>
        controls.sendRequest({
          method: 'POST',
          path: '/insert-one',
          body: {
            unique,
            type: `item-${i}`
          }
        })
      )
    )
      .then(() => Promise.delay(1000))
      .then(agentStubControls.clearRetrievedData)
      .then(() =>
        controls.sendRequest({
          method: 'GET',
          path: `/findall?unique=${unique}`
        })
      )
      .then(docs => {
        expect(docs).to.have.lengthOf(10);
        return utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpan = expectHttpEntry(spans, '/findall');
            expectMongoExit(spans, entrySpan, 'find', JSON.stringify({ unique }));
            expectMongoExit(spans, entrySpan, 'getMore');
            expectHttpExit(spans, entrySpan);
          })
        );
      });
  });

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

  function expectHttpEntry(spans, url, params) {
    return utils.expectOneMatching(spans, span => {
      expect(span.n).to.equal('node.http.server');
      expect(span.p).to.not.exist;
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      expect(span.error).to.equal(false);
      expect(span.data.http.url).to.equal(url);
      if (params) {
        expect(span.data.http.params).to.equal(params);
      }
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

  function expectHttpExit(spans, parentSpan, params) {
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
      if (params) {
        expect(span.data.http.params).to.equal(params);
      }
    });
  }
});
