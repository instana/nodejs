/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const delay = require('@_local/core/test/test_util/delay');
const {
  getSpansByName,
  expectAtLeastOneMatching,
  expectExactlyOneMatching,
  retry
} = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const agentControls = globalAgent.instance;

let libraryEnv;

function startClsTest() {
  globalAgent.setUpCleanUpHooks();
  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        ...libraryEnv
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

  it('should keep cls context when pulling before pushing', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pull-before-push'
      })
      .then(valuesReadFromCls => {
        expect(valuesReadFromCls).to.have.lengthOf(3);
        expect(valuesReadFromCls[0]).to.equal('test-value');
        expect(valuesReadFromCls[1]).to.equal('test-value');
        expect(valuesReadFromCls[2]).to.equal('test-value');
      }));
}

module.exports = function (name, version, isLatest) {
  this.timeout(config.getTestTimeout() * 5);

  if (!supportedVersion(process.versions.node)) {
    return;
  }

  libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };

  describe('cls context', function () {
    startClsTest.call(this);
  });

  describe('subscription tracing', () => {
    globalAgent.setUpCleanUpHooks();

    describe('subscription establishment', function () {
      let serverControls;
      let clientControls;

      before(async () => {
        serverControls = new ProcessControls({
          dirname: __dirname,
          appName: 'apolloServer',
          useGlobalAgent: true,
          env: {
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            LIBRARY_LATEST: isLatest
          }
        });

        clientControls = new ProcessControls({
          dirname: __dirname,
          appName: 'subscriptionClient',
          useGlobalAgent: true,
          env: {
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            LIBRARY_LATEST: isLatest,
            SERVER_PORT: serverControls.getPort()
          }
        });

        await serverControls.startAndWaitForAgentConnection();
        await clientControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await serverControls.stop();
        await clientControls.stop();
      });

      it('must not trace the subscription establishment', () => {
        return clientControls
          .sendRequest({
            method: 'POST',
            path: '/subscription?id=1'
          })
          .then(() => delay(1000))
          .then(() => {
            return agentControls.getSpans().then(spans => {
              expect(getSpansByName(spans, 'graphql.server')).to.have.lengthOf(0);
              expect(getSpansByName(spans, 'log.pino')).to.have.lengthOf(0);
            });
          });
      });
    });

    ['http', 'graphql'].forEach(triggerUpdateVia => {
      describe(`subscription updates (via: ${triggerUpdateVia})`, function () {
        let serverControls;
        let clientControls1;
        let clientControls2;

        before(async () => {
          serverControls = new ProcessControls({
            dirname: __dirname,
            appName: 'apolloServer',
            useGlobalAgent: true,
            env: {
              LIBRARY_VERSION: version,
              LIBRARY_NAME: name,
              LIBRARY_LATEST: isLatest
            }
          });
          clientControls1 = new ProcessControls({
            dirname: __dirname,
            appName: 'subscriptionClient',
            useGlobalAgent: true,
            env: {
              LIBRARY_VERSION: version,
              LIBRARY_NAME: name,
              LIBRARY_LATEST: isLatest,
              SERVER_PORT: serverControls.getPort()
            }
          });

          clientControls2 = new ProcessControls({
            dirname: __dirname,
            appName: 'subscriptionClient',
            useGlobalAgent: true,
            env: {
              LIBRARY_VERSION: version,
              LIBRARY_NAME: name,
              LIBRARY_LATEST: isLatest,
              SERVER_PORT: serverControls.getPort()
            }
          });

          await serverControls.startAndWaitForAgentConnection();
          await clientControls1.startAndWaitForAgentConnection();
          await clientControls2.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await serverControls.stop();
          await clientControls1.stop();
          await clientControls2.stop();
        });

        it(`must trace updates for subscriptions (via: ${triggerUpdateVia})`, () => {
          return (
            Promise.all([
              clientControls1.sendRequest({
                method: 'POST',
                path: '/subscription?id=1'
              }),
              clientControls2.sendRequest({
                method: 'POST',
                path: '/subscription?id=1'
              })
            ])
              .then(() => delay(1000))
              .then(() => {
                switch (triggerUpdateVia) {
                  case 'http':
                    return clientControls1.sendRequest({
                      method: 'POST',
                      path: '/publish-update-via-http'
                    });
                  case 'graphql':
                    return clientControls2.sendRequest({
                      method: 'POST',
                      path: '/publish-update-via-graphql'
                    });
                  default:
                    throw new Error(`Unknown triggerUpdateVia option: ${triggerUpdateVia}`);
                }
              })
              .then(() => {
                return checkSubscriptionUpdatesAndSpans(clientControls1, clientControls2, triggerUpdateVia);
              })
          );
        });
      });
    });
  });
};

function checkSubscriptionUpdatesAndSpans(client1, client2, triggerUpdateVia) {
  return retry(() => {
    const receivedUpdatesClient1 = client1.getIpcMessages();
    expect(receivedUpdatesClient1).to.not.be.empty;
    const receivedUpdatesClient2 = client2.getIpcMessages();
    expect(receivedUpdatesClient2).to.not.be.empty;
    const msg1 = receivedUpdatesClient1[0];
    expect(msg1).to.equal(
      'character updated: ' +
        '{"data":{"characterUpdated":{"id":"1","name":"Updated Name","profession":"Updated Profession"}}}'
    );
    const msg2 = receivedUpdatesClient2[0];
    expect(msg2).to.equal(
      'character updated: ' +
        '{"data":{"characterUpdated":{"id":"1","name":"Updated Name","profession":"Updated Profession"}}}'
    );

    return agentControls.getSpans().then(spans => {
      verifySpansForSubscriptionUpdates(spans, triggerUpdateVia);
    });
  });
}

function verifySpansForSubscriptionUpdates(spans, triggerUpdateVia) {
  let publishTriggerUrl;
  switch (triggerUpdateVia) {
    case 'http':
      publishTriggerUrl = /\/publish-update/;
      break;
    case 'graphql':
      publishTriggerUrl = /\/graphql/;
      break;
    default:
      throw new Error(`Unknown triggerUpdateVia option: ${triggerUpdateVia}`);
  }

  const subscribeHttpEntryInClientApp = verifyHttpEntry(null, /\/subscription/, spans);

  expect(spans.length).to.be.eql(8);

  // verify that the subscription entry has no children
  spans.forEach(span => {
    expect(span.p).to.not.equal(subscribeHttpEntryInClientApp.s);
  });

  const publishUpdatesHttpEntryInClientApp = verifyHttpEntry(
    null,
    new RegExp(`/publish-update-via-${triggerUpdateVia}`),
    spans
  );
  const httpExitInClientApp = verifyHttpExit(publishUpdatesHttpEntryInClientApp, publishTriggerUrl, spans);
  const entryInServerApp =
    triggerUpdateVia === 'http'
      ? verifyHttpEntry(httpExitInClientApp, /\/publish-update/, spans)
      : verifyGraphQLMutationEntry(httpExitInClientApp, spans);

  const graphQLSubscriptionUpdateExits = getSpansByName(spans, 'graphql.client');
  expect(graphQLSubscriptionUpdateExits).to.have.lengthOf(2);
  graphQLSubscriptionUpdateExits.forEach(exitSpan => verifyGraphQLSubscriptionUpdateExit(entryInServerApp, exitSpan));
  verifyFollowUpLogExit(entryInServerApp, 'update: 1: Updated Name Updated Profession', spans);
}

function verifyHttpEntry(parentSpan, urlRegex, spans) {
  return expectAtLeastOneMatching(spans, [
    span => expect(span.n).to.equal('node.http.server'),
    span => expect(span.k).to.equal(constants.ENTRY),
    span => parentSpan && expect(span.t).to.equal(parentSpan.t),
    span => parentSpan && expect(span.p).to.equal(parentSpan.s),
    span => !parentSpan && expect(span.p).to.not.exist,
    span => expect(span.data.http.method).to.equal('POST'),
    span => expect(span.data.http.url).to.match(urlRegex)
  ]);
}

function verifyHttpExit(parentSpan, urlRegex, spans) {
  return expectExactlyOneMatching(spans, [
    span => expect(span.n).to.equal('node.http.client'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.t).to.equal(parentSpan.t),
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.data.http.url).to.match(urlRegex),
    span => expect(span.data.http.method).to.equal('POST')
  ]);
}

function verifyGraphQLMutationEntry(parentSpan, spans) {
  return expectExactlyOneMatching(spans, [
    span => expect(span.n).to.equal('graphql.server'),
    span => expect(span.k).to.equal(constants.ENTRY),
    span => expect(span.t).to.equal(parentSpan.t),
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.data.graphql).to.exist,
    span => expect(span.data.graphql.operationType).to.equal('mutation'),
    span => expect(span.data.graphql.operationName).to.equal('UpdateCharacter'),
    span => expect(span.data.graphql.fields).to.exist,
    span => expect(span.data.graphql.fields.updateCharacter).to.deep.equal(['name', 'profession']),
    span => expect(span.data.graphql.args).to.exist,
    span => expect(span.data.graphql.args.updateCharacter).to.deep.equal(['input'])
  ]);
}

function verifyGraphQLSubscriptionUpdateExit(parentSpan, span) {
  expect(span.n).to.equal('graphql.client');
  expect(span.k).to.equal(constants.EXIT);
  expect(span.t).to.equal(parentSpan.t);
  expect(span.p).to.equal(parentSpan.s);
  expect(span.ts).to.be.a('number');
  expect(span.d).to.be.a('number');
  expect(span.stack).to.be.an('array');
  expect(span.data.graphql).to.exist;
  expect(span.data.graphql.operationType).to.equal('subscription-update');
  expect(span.data.graphql.operationName).to.equal('onCharacterUpdated');
  expect(span.ec).to.equal(0);
  expect(span.error).to.not.exist;
  expect(span.data.graphql.errors).to.not.exist;
  expect(span.data.graphql.fields).to.exist;
  expect(span.data.graphql.fields.characterUpdated).to.deep.equal(['id', 'name', 'profession']);
  expect(span.data.graphql.args).to.exist;
  expect(span.data.graphql.args.characterUpdated).to.deep.equal(['id']);
}

function verifyFollowUpLogExit(parentSpan, expectedMessage, spans) {
  return expectExactlyOneMatching(spans, [
    span => expect(span.n).to.equal('log.pino'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.t).to.equal(parentSpan.t),
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.data.log.message).to.equal(expectedMessage)
  ]);
}
