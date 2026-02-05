/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const Promise = require('bluebird');
const { v4: uuid } = require('uuid');
const _ = require('lodash');

const constants = require('@_instana/core').tracing.constants;
const supportedVersion = require('@_instana/core').tracing.supportedVersion;
const config = require('@_instana/core/test/config');
const { expectExactlyOneMatching, expectAtLeastOneMatching, retry } = require('@_instana/core/test/test_util');
const ProcessControls = require('@_instana/collector/test/test_util/ProcessControls');
const globalAgent = require('@_instana/collector/test/globalAgent');

const USE_ATLAS = process.env.USE_ATLAS === 'true';

module.exports = function (name, version, isLatest) {
    // mongodb v7 does not support node versions < 20
    if (isLatest && semver.lt(process.versions.node, '20.0.0')) {
        console.log(`Skipping tests for version ${version} because it requires Node.js version 20 or higher.`);
        return;
    }

    // NOTE: There is no need to run the ESM APP for all versions.
    if (process.env.RUN_ESM && !isLatest) return;

    const timeout = USE_ATLAS ? config.getTestTimeout() * 2 : config.getTestTimeout();
    this.timeout(timeout);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    ['legacy', 'unified'].forEach(topology => registerSuite.bind(this)(topology));

    function registerSuite(topology) {
        const describeStr = 'default';

        const env = {
            LIBRARY_VERSION: version,
            LIBRARY_LATEST: isLatest,
            LIBRARY_NAME: name,
        };

        if (topology === 'legacy') {
            return;
        }
        describe(describeStr, () => {
            let controls;

            before(async () => {
                controls = new ProcessControls({
                    dirname: __dirname,
                    useGlobalAgent: true,
                    env
                });

                await controls.startAndWaitForAgentConnection();
            });

            beforeEach(async () => {
                await agentControls.clearReceivedTraceData();
            });

            after(async () => {
                await controls.stop();
            });

            afterEach(async () => {
                await controls.clearIpcMessages();
            });

            it('must count', () =>
                controls
                    .sendRequest({
                        method: 'POST',
                        path: '/count',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ foo: 'bar' })
                    })
                    .then(res => {
                        expect(res).to.be.a('number');
                        return retry(() =>
                            agentControls.getSpans().then(spans => {
                                expect(spans).to.have.lengthOf(2);
                                const entrySpan = expectHttpEntry(controls, spans, '/count');
                                expectMongoExit(
                                    controls,
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
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            foo: 'bar'
                        })
                    })
                    .then(() =>
                        retry(() =>
                            agentControls.getSpans().then(spans => {
                                expect(spans).to.have.lengthOf(3);
                                const entrySpan = expectHttpEntry(controls, spans, '/insert-one');
                                expectMongoExit(controls, spans, entrySpan, 'insert');
                                expectHttpExit(controls, spans, entrySpan);
                            })
                        )
                    ));

            it('must trace update requests', () => {
                const unique = uuid();
                return insertDoc(controls, unique)
                    .then(() =>
                        controls.sendRequest({
                            method: 'POST',
                            path: '/update-one',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                filter: { unique },
                                update: {
                                    $set: {
                                        content: 'updated content'
                                    }
                                }
                            })
                        })
                    )
                    .then(() => findDoc(controls, unique))
                    .then(response => {
                        expect(response._id).to.exist;
                        expect(response.unique).to.equal(unique);
                        expect(response.content).to.equal('updated content');

                        return retry(() =>
                            agentControls.getSpans().then(spans => {
                                expect(spans).to.have.lengthOf(9);
                                const entrySpanUpdate = expectHttpEntry(controls, spans, '/update-one');

                                expectMongoExit(
                                    controls,
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
                                            }
                                        }
                                    ])
                                );

                                expectHttpExit(controls, spans, entrySpanUpdate);
                            })
                        );
                    });
            });

            it('must trace replace requests', () => {
                const unique = uuid();
                return insertDoc(controls, unique)
                    .then(() =>
                        controls.sendRequest({
                            method: 'POST',
                            path: '/replace-one',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                filter: { unique },
                                doc: {
                                    unique,
                                    somethingElse: 'replaced'
                                }
                            })
                        })
                    )
                    .then(() => findDoc(controls, unique))
                    .then(response => {
                        expect(response._id).to.exist;
                        expect(response.unique).to.equal(unique);
                        expect(response.somethingElse).to.equal('replaced');

                        return retry(() =>
                            agentControls.getSpans().then(spans => {
                                expect(spans).to.have.lengthOf(9);
                                const entrySpanUpdate = expectHttpEntry(controls, spans, '/replace-one');
                                expectMongoExit(
                                    controls,
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
                                            }
                                        }
                                    ])
                                );
                                expectHttpExit(controls, spans, entrySpanUpdate);
                            })
                        );
                    });
            });

            it('must trace delete requests', () => {
                const unique = uuid();
                return insertDoc(controls, unique)
                    .then(() =>
                        controls.sendRequest({
                            method: 'POST',
                            path: '/delete-one',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                filter: { unique }
                            })
                        })
                    )
                    .then(() => findDoc(controls, unique))
                    .then(response => {
                        expect(response).to.not.exist;
                        return retry(() =>
                            agentControls.getSpans().then(spans => {
                                expect(spans).to.have.lengthOf(9);
                                const entrySpanUpdate = expectHttpEntry(controls, spans, '/delete-one');
                                expectMongoExit(
                                    controls,
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
                                expectHttpExit(controls, spans, entrySpanUpdate);
                            })
                        );
                    });
            });

            it('must trace find requests', () =>
                controls
                    .sendRequest({
                        method: 'POST',
                        path: '/find-one',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            bla: 'blub'
                        })
                    })
                    .then(() =>
                        retry(() =>
                            agentControls.getSpans().then(spans => {
                                expect(spans).to.have.lengthOf(3);
                                const entrySpan = expectHttpEntry(controls, spans, '/find-one');
                                expectMongoExit(
                                    controls,
                                    spans,
                                    entrySpan,
                                    'find',
                                    JSON.stringify({
                                        bla: 'blub'
                                    })
                                );
                                expectHttpExit(controls, spans, entrySpan);
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
                    // Add a little delay (smaller than the delay in app.js, so it will happen while that trace is still active)
                    setTimeout(resolve, 750);
                }).then(() =>
                    // Trigger another HTTP request, this one must _not_ appear in the first trace triggered by POST /long-find.
                    controls.sendRequest({
                        method: 'POST',
                        path: `/long-find?call=2&unique=${unique}`
                    })
                );

                return insertDoc(controls, unique)
                    .then(() => Promise.all([firstRequest, secondRequest]))
                    .then(() =>
                        retry(() =>
                            agentControls.getSpans().then(spans => {
                                const entrySpan1 = expectHttpEntry(controls, spans, '/long-find', `call=1&unique=${unique}`);
                                const entrySpan2 = expectHttpEntry(controls, spans, '/long-find', `call=2&unique=${unique}`);
                                expect(entrySpan1.t).to.not.equal(entrySpan2.t);
                                expect(entrySpan1.p).to.not.exist;
                                expectMongoExit(
                                    controls,
                                    spans,
                                    entrySpan1,
                                    'find',
                                    JSON.stringify({
                                        unique
                                    })
                                );
                                expectHttpExit(controls, spans, entrySpan1, 'call=1');
                                expect(entrySpan2.p).to.not.exist;
                                expectMongoExit(
                                    controls,
                                    spans,
                                    entrySpan2,
                                    'find',
                                    JSON.stringify({
                                        unique
                                    })
                                );
                                expectHttpExit(controls, spans, entrySpan2, 'call=2');
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
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                unique,
                                type: `item-${i}`
                            })
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
                                const entrySpan = expectHttpEntry(controls, spans, '/findall');
                                expectMongoExit(controls, spans, entrySpan, 'find', JSON.stringify({ unique }));
                                expectMongoExit(controls, spans, entrySpan, 'getMore');
                                expectHttpExit(controls, spans, entrySpan);
                            })
                        );
                    });
            });
        });
    }

    function insertDoc(controls, unique) {
        return controls.sendRequest({
            method: 'POST',
            path: '/insert-one',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                unique,
                content: 'some content'
            })
        });
    }

    function findDoc(controls, unique) {
        return controls.sendRequest({
            method: 'POST',
            path: '/find-one',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                unique
            })
        });
    }

    function expectHttpEntry(controls, spans, url, params) {
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

    function expectMongoExit(controls, spans, parentSpan, command, filter, query, json) {
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

    function expectHttpExit(controls, spans, parentSpan, params) {
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
};
