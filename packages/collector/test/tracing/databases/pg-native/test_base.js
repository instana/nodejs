/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const {
    retry,
    getSpansByName,
    expectAtLeastOneMatching,
    expectExactlyOneMatching
} = require('@_local/core/test/test_util');

const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
    this.timeout(config.getTestTimeout());

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    let controls;

    before(async () => {
        const env = {
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            LIBRARY_LATEST: isLatest
        };

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

    it('must trace select', () =>
        controls
            .sendRequest({
                method: 'POST',
                path: '/select'
            })
            .then(response => {
                verifySimpleSelectResponse(response);
                return retry(() =>
                    agentControls.getSpans().then(spans => {
                        const httpEntry = verifyHttpEntry(spans, '/select');
                        verifyPgExit(spans, httpEntry, 'SELECT NOW()');
                        verifyHttpExit(spans, httpEntry);
                    })
                );
            }));

    it('must trace sync select', () =>
        controls
            .sendRequest({
                method: 'POST',
                path: '/select-sync'
            })
            .then(response => {
                verifySimpleSelectResponse(response);
                return retry(() =>
                    agentControls.getSpans().then(spans => {
                        const httpEntry = verifyHttpEntry(spans, '/select-sync');
                        verifyPgExit(spans, httpEntry, 'SELECT NOW()');
                        verifyHttpExit(spans, httpEntry);
                    })
                );
            }));

    it('must trace insert', () =>
        controls
            .sendRequest({
                method: 'POST',
                path: '/insert'
            })
            .then(response => {
                verifyInsertResponse(response);
                return retry(() =>
                    agentControls.getSpans().then(spans => {
                        const httpEntry = verifyHttpEntry(spans, '/insert');
                        verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
                        verifyHttpExit(spans, httpEntry);
                    })
                );
            }));

    it('must trace prepared statement execution', () =>
        controls
            .sendRequest({
                method: 'POST',
                path: '/prepared-statement'
            })
            .then(response => {
                verifyInsertResponse(response, 'gonzo', 'gonzo@muppets.com');
                return retry(() =>
                    agentControls.getSpans().then(spans => {
                        const httpEntry = verifyHttpEntry(spans, '/prepared-statement');
                        verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
                        verifyHttpExit(spans, httpEntry);
                    })
                );
            }));

    it('must trace sync prepared statement execution', () =>
        controls
            .sendRequest({
                method: 'POST',
                path: '/prepared-statement-sync'
            })
            .then(response => {
                verifyInsertResponse(response, 'scooter', 'scooter@muppets.com');
                return retry(() =>
                    agentControls.getSpans().then(spans => {
                        const httpEntry = verifyHttpEntry(spans, '/prepared-statement-sync');
                        verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
                        verifyHttpExit(spans, httpEntry);
                    })
                );
            }));

    it('must capture errors', () =>
        controls
            .sendRequest({
                method: 'POST',
                path: '/error',
                simple: false
            })
            .then(response => {
                expect(response).to.exist;
                expect(response.error).to.contain('Error: ERROR:');
                expect(response.error).to.contain('relation "nonexistanttable" does not exist');

                return retry(() =>
                    agentControls.getSpans().then(spans => {
                        const httpEntry = verifyHttpEntry(spans, '/error');
                        verifyPgExitWithError(
                            spans,
                            httpEntry,
                            'SELECT name, email FROM nonexistanttable',
                            'relation "nonexistanttable" does not exist'
                        );
                        verifyHttpExit(spans, httpEntry);
                    })
                );
            }));

    it('must capture sync errors', () =>
        controls
            .sendRequest({
                method: 'POST',
                path: '/error-sync',
                simple: false
            })
            .then(response => {
                expect(response).to.exist;
                expect(response.error).to.contain('Error: ERROR:');
                expect(response.error).to.contain('relation "nonexistanttable" does not exist');
                return retry(() =>
                    agentControls.getSpans().then(spans => {
                        const httpEntry = verifyHttpEntry(spans, '/error-sync');
                        verifyPgExitWithError(
                            spans,
                            httpEntry,
                            'SELECT name, email FROM nonexistanttable',
                            'relation "nonexistanttable" does not exist'
                        );
                        verifyHttpExit(spans, httpEntry);
                    })
                );
            }));

    it('must suppress', () =>
        controls
            .sendRequest({
                method: 'POST',
                path: '/insert',
                suppressTracing: true
            })
            .then(response => {
                verifyInsertResponse(response);
                return retry(() =>
                    agentControls.getSpans().then(spans => {
                        const entrySpans = getSpansByName(spans, 'node.http.server');
                        expect(entrySpans).to.have.lengthOf(0);
                        const pgExits = getSpansByName(spans, 'postgres');
                        expect(pgExits).to.have.lengthOf(0);
                    })
                );
            }));

    it('must trace transactions', () =>
        controls
            .sendRequest({
                method: 'POST',
                path: '/transaction'
            })
            .then(response => {
                verifyInsertResponse(response, 'animal', 'animal@muppets.com');
                return retry(() =>
                    agentControls.getSpans().then(spans => {
                        const httpEntry = verifyHttpEntry(spans, '/transaction');
                        expect(getSpansByName(spans, 'postgres')).to.have.lengthOf(4);
                        verifyPgExit(spans, httpEntry, 'BEGIN');
                        verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
                        verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
                        verifyPgExit(spans, httpEntry, 'COMMIT');
                        verifyHttpExit(spans, httpEntry);
                    })
                );
            }));

    it('must finish span when query is cancelled', () =>
        controls
            .sendRequest({
                method: 'POST',
                path: '/cancel'
            })
            .then(response => {
                expect(response).to.exist;
                expect(response.results).to.be.an('array');
                expect(response.results).to.be.empty;
                expect(response.hasBeenCancelled).to.be.true;
                return retry(() =>
                    agentControls.getSpans().then(spans => {
                        const httpEntry = verifyHttpEntry(spans, '/cancel');
                        verifyPgExitWithError(
                            spans,
                            httpEntry,
                            'SELECT NOW() FROM pg_sleep(1)',
                            'canceling statement due to user request'
                        );
                        verifyHttpExit(spans, httpEntry);
                    })
                );
            }));

    function verifySimpleSelectResponse(response) {
        expect(response).to.be.an('array');
        expect(response).to.have.lengthOf(1);
        expect(response[0].now).to.be.a('string');
    }

    function verifyInsertResponse(response, name = 'beaker', email = 'beaker@muppets.com') {
        expect(response).to.be.an('array');
        expect(response).to.have.lengthOf(1);
        expect(response[0].name).to.equal(name);
        expect(response[0].email).to.equal(email);
    }

    function verifyHttpEntry(spans, url) {
        return expectAtLeastOneMatching(spans, [
            span => expect(span.p).to.not.exist,
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.f.e).to.equal(String(controls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid'),
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.data.http.url).to.equal(url)
        ]);
    }

    function verifyPgExit(spans, parent, statement) {
        return expectAtLeastOneMatching(spans, span => {
            verifyPgExitBase(span, parent, statement);
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
        });
    }

    function verifyPgExitWithError(spans, parent, statement, errorMessage) {
        return expectAtLeastOneMatching(spans, span => {
            verifyPgExitBase(span, parent, statement);
            expect(span.error).to.not.exist;
            expect(span.stack).to.exist;
            expect(span.ec).to.equal(1);
            expect(span.data.pg.error).to.contain(errorMessage);
        });
    }

    function verifyPgExitBase(span, parent, statement) {
        expect(span.n).to.equal('postgres');
        expect(span.k).to.equal(constants.EXIT);
        expect(span.t).to.equal(parent.t);
        expect(span.p).to.equal(parent.s);
        expect(span.f.e).to.equal(String(controls.getPid()));
        expect(span.f.h).to.equal('agent-stub-uuid');
        expect(span.async).to.not.exist;
        expect(span.data).to.exist;
        expect(span.data.pg).to.exist;
        expect(span.data.pg.host).to.equal('127.0.0.1');
        expect(span.data.pg.port).to.equal('5432');
        expect(span.data.pg.user).to.equal('node');
        expect(span.data.pg.db).to.equal('nodedb');
        expect(span.data.pg.stmt).to.equal(statement);
    }

    function verifyHttpExit(spans, parent) {
        expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(parent.t),
            span => expect(span.p).to.equal(parent.s),
            span => expect(span.n).to.equal('node.http.client'),
            span => expect(span.k).to.equal(constants.EXIT),
            span => expect(span.f.e).to.equal(String(controls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid'),
            span => expect(span.async).to.not.exist,
            span => expect(span.error).to.not.exist,
            span => expect(span.ec).to.equal(0),
            span => expect(span.data.http.method).to.equal('GET'),
            span => expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/),
            span => expect(span.data.http.status).to.equal(200)
        ]);
    }
};
