/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const Promise = require('bluebird');
const { v4: uuid } = require('uuid');
const _ = require('lodash');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { expectExactlyOneMatching, expectAtLeastOneMatching, retry } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const USE_ATLAS = process.env.USE_ATLAS === 'true';

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/mongodb', function() {
  const timeout = USE_ATLAS ? config.getTestTimeout() * 2 : config.getTestTimeout();
  this.timeout(timeout);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  ['legacy', 'unified'].forEach(topology => registerSuite.bind(this)(topology));

  function registerSuite(topology) {
    describe(`with topology ${topology}`, () => {
      const env = {};
      if (topology === 'legacy') {
        env.USE_LEGACY_3_X_CONNECTION_MECHANISM = true;
      }

      const controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env
      });
      ProcessControls.setUpHooks(controls);

      it('must count', () =>
        controls
          .sendRequest({
            method: 'POST',
            path: '/count',
            body: {
              foo: 'bar'
            }
          })
          .then(res => {
            expect(res).to.be.a('number');
            return retry(() =>
              agentControls.getSpans().then(spans => {
                const entrySpan = expectHttpEntry(spans, '/count');
                expectMongoExit(
                  spans,
                  entrySpan,
                  'count',
                  JSON.stringify({
                    foo: 'bar'
                  })
                );
              })
            );
          }));

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
            retry(() =>
              agentControls.getSpans().then(spans => {
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
            return retry(() =>
              agentControls.getSpans().then(spans => {
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
            return retry(() =>
              agentControls.getSpans().then(spans => {
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
            return retry(() =>
              agentControls.getSpans().then(spans => {
                const entrySpanUpdate = expectHttpEntry(spans, '/delete-one');
                expectMongoExit(
                  spans,
                  entrySpanUpdate,
                  /(?:delete|remove)/,
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
            retry(() =>
              agentControls.getSpans().then(spans => {
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
            retry(() =>
              agentControls.getSpans().then(spans => {
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
          .then(agentControls.clearRetrievedData)
          .then(() =>
            controls.sendRequest({
              method: 'GET',
              path: `/findall?unique=${unique}`
            })
          )
          .then(docs => {
            expect(docs).to.have.lengthOf(10);
            return retry(() =>
              agentControls.getSpans().then(spans => {
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
        const expectations = [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.p).to.not.exist,
          span => expect(span.f.e).to.equal(String(controls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.async).to.not.exist,
          span => expect(span.error).to.not.exist,
          span => expect(span.ec).to.equal(0),
          span => expect(span.data.http.url).to.equal(url)
        ];
        if (params) {
          expectations.push(span => expect(span.data.http.params).to.equal(params));
        }

        return expectExactlyOneMatching(spans, expectations);
      }

      function expectMongoExit(spans, parentSpan, command, filter, query, json) {
        let expectations = [
          span => expect(span.n).to.equal('mongo'),
          span => expect(span.k).to.equal(constants.EXIT),
          span => expect(span.f.e).to.equal(String(controls.getPid())),
          span => expect(span.t).to.equal(parentSpan.t),
          span => expect(span.p).to.equal(parentSpan.s),
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.async).to.not.exist,
          span => expect(span.error).to.not.exist,
          span => expect(span.ec).to.equal(0),
          span => expect(span.data.mongo.namespace).to.match(/myproject(?:\.mydocs|\.\$cmd)/)
        ];

        if (typeof command === 'string') {
          expectations.push(span => expect(span.data.mongo.command).to.equal(command));
        } else if (command instanceof RegExp) {
          expectations.push(span => expect(span.data.mongo.command).to.match(command));
        } else {
          throw new Error(`Type of expected command is not supported: ${command} (${typeof command}).`);
        }

        if (USE_ATLAS) {
          expectations = expectations.concat([
            span => expect(span.data.peer.hostname).to.include('.mongodb.net'),
            span => expect(span.data.peer.port).to.equal(27017),
            span => expect(span.data.mongo.service).to.include('.mongodb.net:27017')
          ]);
        } else {
          expectations = expectations.concat([
            span => expect(span.data.peer.hostname).to.equal('127.0.0.1'),
            span => expect(span.data.peer.port).to.equal(27017),
            span => expect(span.data.mongo.service).to.equal(process.env.MONGODB)
          ]);
        }
        if (filter != null) {
          expectations.push(span => expect(span.data.mongo.filter).to.equal(filter));
        } else {
          expectations.push(span => expect(span.data.mongo.filter).to.not.exist);
        }
        if (query != null) {
          expectations.push(span => expect(span.data.mongo.query).to.equal(query));
        } else {
          expectations.push(span => expect(span.data.mongo.query).to.not.exist);
        }
        if (json != null) {
          expectations.push(span => expect(span.data.mongo.json).to.equal(json));
        } else {
          expectations.push(span => expect(span.data.mongo.json).to.not.exist);
        }
        return expectAtLeastOneMatching(spans, expectations);
      }

      function expectHttpExit(spans, parentSpan, params) {
        return expectExactlyOneMatching(spans, span => {
          expect(span.t).to.equal(parentSpan.t);
          expect(span.p).to.equal(parentSpan.s);
          expect(span.n).to.equal('node.http.client');
          expect(span.k).to.equal(constants.EXIT);
          expect(span.f.e).to.equal(String(controls.getPid()));
          expect(span.f.h).to.equal('agent-stub-uuid');
          expect(span.async).to.not.exist;
          expect(span.error).to.not.exist;
          expect(span.ec).to.equal(0);
          expect(span.data.http.method).to.equal('GET');
          expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
          expect(span.data.http.status).to.equal(200);
          if (params) {
            expect(span.data.http.params).to.equal(params);
          }
        });
      }
    });
  }
});
