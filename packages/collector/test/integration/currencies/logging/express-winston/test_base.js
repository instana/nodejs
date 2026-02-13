/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect, fail } = require('chai');

const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

module.exports = function (name, version, isLatest) {
    mochaSuiteFn(`tracing/logging/${name}@${version}`, function () {
        this.timeout(config.getTestTimeout());

        globalAgent.setUpCleanUpHooks();
        const agentControls = globalAgent.instance;

        let controls;

        before(async () => {
            controls = new ProcessControls({
                dirname: __dirname,
                useGlobalAgent: true,
                env: {
                    LIBRARY_LATEST: isLatest,
                    LIBRARY_VERSION: version,
                    LIBRARY_NAME: name
                }
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

        it('should not trace HTTP 200/info', () =>
            controls
                .sendRequest({
                    path: '/200'
                })
                .then(() =>
                    testUtils.retry(() =>
                        agentControls.getSpans().then(spans => {
                            testUtils.expectAtLeastOneMatching(spans, [
                                span => expect(span.n).to.equal('node.http.server'),
                                span => expect(span.f.e).to.equal(String(controls.getPid())),
                                span => expect(span.f.h).to.equal('agent-stub-uuid')
                            ]);
                            const winstonSpans = testUtils.getSpansByName(spans, 'log.winston');
                            expect(winstonSpans).to.be.empty;
                        })
                    )
                ));

        it('should trace HTTP 400/warn', () =>
            controls
                .sendRequest({
                    path: '/400',
                    simple: false
                })
                .then(() =>
                    testUtils.retry(() =>
                        agentControls.getSpans().then(spans => {
                            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
                                span => expect(span.n).to.equal('node.http.server'),
                                span => expect(span.f.e).to.equal(String(controls.getPid())),
                                span => expect(span.f.h).to.equal('agent-stub-uuid')
                            ]);
                            testUtils.expectAtLeastOneMatching(spans, span => {
                                checkWinstonSpan(span, entrySpan, false, 'HTTP GET /400');
                            });
                        })
                    )
                ));

        it('should trace HTTP 500/warn as an error', () =>
            controls
                .sendRequest({
                    path: '/500',
                    simple: false
                })
                .then(() =>
                    testUtils.retry(() =>
                        agentControls.getSpans().then(spans => {
                            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
                                span => expect(span.n).to.equal('node.http.server'),
                                span => expect(span.f.e).to.equal(String(controls.getPid())),
                                span => expect(span.f.h).to.equal('agent-stub-uuid')
                            ]);
                            testUtils.expectAtLeastOneMatching(spans, span => {
                                checkWinstonSpan(span, entrySpan, true, 'HTTP GET /500');
                            });
                        })
                    )
                ));

        function checkWinstonSpan(span, parent, erroneous, message) {
            expect(span.t).to.equal(parent.t);
            expect(span.p).to.equal(parent.s);
            expect(span.k).to.equal(constants.EXIT);
            expect(span.f.e).to.equal(String(controls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.n).to.equal('log.winston');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(erroneous ? 1 : 0);
            expect(span.data).to.exist;
            expect(span.data.log).to.exist;
            expect(span.data.log.message).to.equal(message);
            verifyStackTrace(span);
        }

        function verifyStackTrace(span) {
            expect(span.stack).to.be.an('array');
            expect(span.stack).to.not.be.empty;
            let found = false;
            span.stack.forEach(callSite => {
                found = found || (callSite.c.includes('express-winston/') && callSite.c.includes('/app.'));
            });
            if (!found) {
                fail(`Did not find the expected call site express-winston/app.js in ${JSON.stringify(span.stack, null, 2)}`);
            }
        }
    });
};
