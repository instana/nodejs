/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const delay = require('../../../../../core/test/test_util/delay');
const {
  getSpansByName,
  expectAtLeastOneMatching,
  expectExactlyOneMatching,
  retry
} = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

function start(graphqlVersion) {
  this.timeout(config.getTestTimeout() * 5);

  if (!supportedVersion(process.versions.node)) {
    return;
  }

  describe(`${graphqlVersion}`, () => {
    globalAgent.setUpCleanUpHooks();

    const useAlias = Math.random >= 0.5;

    ['raw', 'apollo'].forEach(type => {
      describe(`${type} queries`, function () {
        ['amqp', 'http'].forEach(communicationProtocol => {
          if (type === 'apollo' && communicationProtocol === 'amqp') {
            return it.skip('Test scenario Apollo & AMPQ is not supported.');
          }

          [false, true].forEach(withError => {
            [false, true].forEach(queryShorthand => {
              // eslint-disable-next-line max-len
              const title = `withError: ${withError} queryShorthand: ${queryShorthand} useAlias: ${useAlias} communicationProtocol: ${communicationProtocol}`;

              describe(title, function () {
                let serverControls;
                let clientControls;

                before(async () => {
                  serverControls = new ProcessControls({
                    appPath: path.join(__dirname, type === 'raw' ? 'rawGraphQLServer' : 'apolloServer'),
                    useGlobalAgent: true,
                    env: {
                      GRAPHQL_VERSION: graphqlVersion
                    }
                  });
                  clientControls = new ProcessControls({
                    appPath: path.join(__dirname, 'client'),
                    useGlobalAgent: true,
                    env: {
                      SERVER_PORT: serverControls.getPort(),
                      GRAPHQL_VERSION: graphqlVersion
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

                it.skip('must trace a query with a value resolver', () => {
                  const resolverType = 'value';
                  const multipleEntities = null;

                  const queryParams = [
                    withError ? 'withError=yes' : null,
                    queryShorthand ? 'queryShorthand=yes' : null,
                    multipleEntities ? 'multipleEntities=yes' : null,
                    useAlias ? 'useAlias=yes' : null,
                    `communicationProtocol=${communicationProtocol}`
                  ]
                    .filter(param => !!param)
                    .join('&');

                  const url = queryParams ? `/${resolverType}?${queryParams}` : `/${resolverType}`;

                  return clientControls
                    .sendRequest({
                      method: 'POST',
                      path: url
                    })
                    .then(response => {
                      const entityName = withError ? `${resolverType}Error` : resolverType;
                      const entityNameWithAlias = useAlias ? `${entityName}Alias` : entityName;

                      checkQueryResponse(entityNameWithAlias, withError, null, response);

                      return retry(() => {
                        return agentControls.getSpans().then(spans => {
                          return verifySpansForQuery(
                            {
                              resolverType,
                              entityName,
                              withError,
                              queryShorthand,
                              multipleEntities,
                              communicationProtocol
                            },
                            spans
                          );
                        });
                      });
                    });
                });

                it('must trace a query with a promise resolver', () => {
                  const resolverType = 'promise';
                  const multipleEntities = null;

                  const queryParams = [
                    withError ? 'withError=yes' : null,
                    queryShorthand ? 'queryShorthand=yes' : null,
                    multipleEntities ? 'multipleEntities=yes' : null,
                    useAlias ? 'useAlias=yes' : null,
                    `communicationProtocol=${communicationProtocol}`
                  ]
                    .filter(param => !!param)
                    .join('&');

                  const url = queryParams ? `/${resolverType}?${queryParams}` : `/${resolverType}`;

                  return clientControls
                    .sendRequest({
                      method: 'POST',
                      path: url
                    })
                    .then(response => {
                      const entityName = withError ? `${resolverType}Error` : resolverType;
                      const entityNameWithAlias = useAlias ? `${entityName}Alias` : entityName;

                      checkQueryResponse(entityNameWithAlias, withError, null, response);

                      return retry(() =>
                        agentControls.getSpans().then(
                          verifySpansForQuery.bind(null, {
                            resolverType,
                            entityName,
                            withError,
                            queryShorthand,
                            multipleEntities,
                            communicationProtocol
                          })
                        )
                      );
                    });
                });

                it('must trace a query which resolves to an array of promises', () => {
                  const resolverType = 'array';
                  const multipleEntities = null;

                  const queryParams = [
                    withError ? 'withError=yes' : null,
                    queryShorthand ? 'queryShorthand=yes' : null,
                    multipleEntities ? 'multipleEntities=yes' : null,
                    useAlias ? 'useAlias=yes' : null,
                    `communicationProtocol=${communicationProtocol}`
                  ]
                    .filter(param => !!param)
                    .join('&');

                  const url = queryParams ? `/${resolverType}?${queryParams}` : `/${resolverType}`;

                  return clientControls
                    .sendRequest({
                      method: 'POST',
                      path: url
                    })
                    .then(response => {
                      const entityName = withError ? `${resolverType}Error` : resolverType;
                      const entityNameWithAlias = useAlias ? `${entityName}Alias` : entityName;

                      checkQueryResponse(entityNameWithAlias, withError, null, response);

                      return retry(() =>
                        agentControls.getSpans().then(
                          verifySpansForQuery.bind(null, {
                            resolverType,
                            entityName,
                            withError,
                            queryShorthand,
                            multipleEntities,
                            communicationProtocol
                          })
                        )
                      );
                    });
                });

                it('must trace a query with multiple entities', () => {
                  const resolverType = 'array';
                  const multipleEntities = true;

                  const queryParams = [
                    withError ? 'withError=yes' : null,
                    queryShorthand ? 'queryShorthand=yes' : null,
                    multipleEntities ? 'multipleEntities=yes' : null,
                    useAlias ? 'useAlias=yes' : null,
                    `communicationProtocol=${communicationProtocol}`
                  ]
                    .filter(param => !!param)
                    .join('&');

                  const url = queryParams ? `/${resolverType}?${queryParams}` : `/${resolverType}`;

                  return clientControls
                    .sendRequest({
                      method: 'POST',
                      path: url
                    })
                    .then(response => {
                      const entityName = withError ? `${resolverType}Error` : resolverType;
                      const entityNameWithAlias = useAlias ? `${entityName}Alias` : entityName;

                      checkQueryResponse(entityNameWithAlias, withError, null, response);

                      return retry(() =>
                        agentControls.getSpans().then(
                          verifySpansForQuery.bind(null, {
                            resolverType,
                            entityName,
                            withError,
                            queryShorthand,
                            multipleEntities,
                            communicationProtocol
                          })
                        )
                      );
                    });
                });
              });
            });
          });
        });

        describe(`${type}: mutations`, function () {
          let serverControls;
          let clientControls;

          before(async () => {
            serverControls = new ProcessControls({
              appPath: path.join(__dirname, type === 'raw' ? 'rawGraphQLServer' : 'apolloServer'),
              useGlobalAgent: true,
              env: {
                GRAPHQL_VERSION: graphqlVersion
              }
            });
            clientControls = new ProcessControls({
              appPath: path.join(__dirname, 'client'),
              useGlobalAgent: true,
              env: {
                SERVER_PORT: serverControls.getPort(),
                GRAPHQL_VERSION: graphqlVersion
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

          it('must trace a mutation', () => {
            const url = '/mutation';

            return clientControls
              .sendRequest({
                method: 'POST',
                path: url
              })
              .then(response => {
                checkMutationResponse(response);
                return retry(() => agentControls.getSpans().then(verifySpansForMutation));
              });
          });
        });

        describe(`${type}: subscriptions`, function () {
          let serverControls;
          let clientControls;

          before(async () => {
            serverControls = new ProcessControls({
              appPath: path.join(__dirname, type === 'raw' ? 'rawGraphQLServer' : 'apolloServer'),
              useGlobalAgent: true,
              env: {
                GRAPHQL_VERSION: graphqlVersion
              }
            });

            clientControls = new ProcessControls({
              appPath: path.join(__dirname, 'client'),
              useGlobalAgent: true,
              env: {
                SERVER_PORT: serverControls.getPort(),
                GRAPHQL_VERSION: graphqlVersion
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
      });
    });

    ['http', 'graphql'].forEach(triggerUpdateVia => {
      describe(`(ApolloServer) subscriptions (via: ${triggerUpdateVia})`, function () {
        let serverControls;
        let clientControls1;
        let clientControls2;

        before(async () => {
          serverControls = new ProcessControls({
            appPath: path.join(__dirname, 'apolloServer'),
            useGlobalAgent: true,
            env: {
              GRAPHQL_VERSION: graphqlVersion
            }
          });
          clientControls1 = new ProcessControls({
            appPath: path.join(__dirname, 'client'),
            useGlobalAgent: true,
            env: {
              SERVER_PORT: serverControls.getPort(),
              GRAPHQL_VERSION: graphqlVersion
            }
          });

          clientControls2 = new ProcessControls({
            appPath: path.join(__dirname, 'client'),
            useGlobalAgent: true,
            env: {
              SERVER_PORT: serverControls.getPort(),
              GRAPHQL_VERSION: graphqlVersion
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
              // subscribe first client
              clientControls1.sendRequest({
                method: 'POST',
                path: '/subscription?id=1'
              }),
              // subscribe second client
              clientControls2.sendRequest({
                method: 'POST',
                path: '/subscription?id=1'
              })
            ])
              // wait a second so that subscriptions are fully established
              .then(() => delay(1000))
              .then(() => {
                // send update via one arbitrary client
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

    // eslint-disable-next-line max-len
    // This test is currently disabled because it describes a known issue. When the application under monitoring receives
    // eslint-disable-next-line max-len
    // multiple concurrent requests with GraphQL mutations, and if there are subscribed clients, all graphql.client/ spans
    // (which represent the subscription update calls from the GraphQL server to the subscribed clients) are
    // attached to the first HTTP entry span, instead of the entry spans that actually triggered them.
    describe.skip('(ApolloServer) correct parent span for subscription updates', function () {
      let serverControls;
      let clientControls;
      const triggerUpdateVia = 'http';

      before(async () => {
        serverControls = new ProcessControls({
          appPath: path.join(__dirname, 'apolloServer'),
          useGlobalAgent: true,
          env: {
            GRAPHQL_VERSION: graphqlVersion
          }
        });
        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'client'),
          useGlobalAgent: true,
          env: {
            SERVER_PORT: serverControls.getPort(),
            GRAPHQL_VERSION: graphqlVersion
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

      it(`must not confuse parent context for parallel request (via: ${triggerUpdateVia})`, async () => {
        await clientControls.sendRequest({
          method: 'POST',
          path: '/subscription?id=1'
        });

        // wait a second so that subscriptions are fully established
        await delay(1000);

        const requests = [
          {
            method: 'POST',
            path: '/publish-update-via-http?id=1',
            body: { id: 1, name: 'Name 1' }
          },
          {
            method: 'POST',
            path: '/publish-update-via-http?id=2',
            body: { id: 2, name: 'Name 2' }
          },
          {
            method: 'POST',
            path: '/publish-update-via-http?id=3',
            body: { id: 3, name: 'Name 3' }
          }
        ];

        // send three parallel updates
        await Promise.all(requests.map(requestConfig => clientControls.sendRequest(requestConfig)));

        await checkSubscriptionUpdateAndSpanForParallelRequests(clientControls);
      });
    });

    describe('suppressed', function () {
      let serverControls;
      let clientControls;

      before(async () => {
        serverControls = new ProcessControls({
          appPath: path.join(__dirname, 'apolloServer'),
          useGlobalAgent: true,
          env: {
            GRAPHQL_VERSION: graphqlVersion
          }
        });

        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'client'),
          useGlobalAgent: true,
          env: {
            SERVER_PORT: serverControls.getPort(),
            GRAPHQL_VERSION: graphqlVersion
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

      it('should not trace', () => {
        return clientControls
          .sendRequest({
            method: 'POST',
            path: '/value',
            suppressTracing: true
          })
          .then(response => {
            checkQueryResponse('value', false, false, response);
            return delay(1000);
          })
          .then(() => {
            return agentControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(0);
            });
          });
      });
    });

    describe('disabled', function () {
      let serverControls;
      let clientControls;

      before(async () => {
        serverControls = new ProcessControls({
          appPath: path.join(__dirname, 'rawGraphQLServer'),
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            GRAPHQL_VERSION: graphqlVersion
          }
        });
        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'client'),
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            SERVER_PORT: serverControls.getPort(),
            GRAPHQL_VERSION: graphqlVersion
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

      it('should not trace when disabled', () => {
        return clientControls
          .sendRequest({
            method: 'POST',
            path: '/value'
          })
          .then(response => {
            checkQueryResponse('value', false, false, response);
            return delay(1000);
          })
          .then(() => {
            return agentControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(0);
            });
          });
      });
    });

    describe('individually disabled', () => {
      let serverControls;
      let clientControls;

      before(async () => {
        serverControls = new ProcessControls({
          appPath: path.join(__dirname, 'rawGraphQLServer'),
          useGlobalAgent: true,
          env: {
            INSTANA_TRACING_DISABLE: 'graphQL',
            GRAPHQL_VERSION: graphqlVersion
          }
        });
        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'client'),
          useGlobalAgent: true,
          env: {
            SERVER_PORT: serverControls.getPort(),
            GRAPHQL_VERSION: graphqlVersion
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

      it('should not trace graphql when that tracer is disabled individually but still trace all other calls', () => {
        return clientControls
          .sendRequest({
            method: 'POST',
            path: '/value'
          })
          .then(response => {
            checkQueryResponse('value', false, false, response);

            return retry(() => {
              return agentControls.getSpans().then(spans => {
                const httpEntryInClientApp = verifyHttpEntry(null, /\/value/, spans);
                const httpExitInClientApp = verifyHttpExit(httpEntryInClientApp, /\/graphql/, spans);
                const httpEntryInServerApp = verifyHttpEntry(httpExitInClientApp, /\/graphql/, spans);
                verifyFollowUpLogExit(httpEntryInServerApp, 'value', spans);
                // No graphql span has been recorded but graphql since we have explicitly
                // disabled graphql tracing, but
                // processing has worked (as we have verified via checkQueryResponse).
                expect(getSpansByName(spans, 'graphql.server')).to.be.empty;
                expect(getSpansByName(spans, 'graphql.client')).to.be.empty;
              });
            });
          });
      });
    });
  });
}

function checkQueryResponse(entityNameWithAlias, withError, multipleEntities, response) {
  expect(response.data).to.exist;
  const result = response.data[entityNameWithAlias];
  const errors = response.errors;
  if (!withError) {
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(3);
    const jim = result[0];
    const naomi = result[1];
    const amos = result[2];
    expect(jim.name).to.equal('James Holden');
    expect(jim.profession).to.equal('Captain');
    expect(naomi.name).to.equal('Naomi Nagata');
    expect(naomi.profession).to.equal('Executive Officer');
    expect(amos.name).to.equal('Amos Burton');
    expect(amos.profession).to.equal('Mechanic');
    expect(errors).to.not.exist;
  } else {
    const isArray = entityNameWithAlias.indexOf('array') === 0;
    isArray ? expect(result).to.deep.equal([null, null, null]) : expect(result).to.not.exist;
    expect(errors).to.be.an('array');
    expect(errors).to.have.lengthOf(isArray ? 3 : 1);
    const error = errors[0];
    expect(error.message).to.equal('Boom');
    expect(error.path).to.be.an('array');
    expect(error.path).to.include(entityNameWithAlias);
  }
  if (multipleEntities) {
    expect(response.data.ships).to.exist;
    const ships = response.data.ships;
    const cant = ships[0];
    const roci = ships[1];
    expect(cant.name).to.equal('Canterbury');
    expect(cant.origin).to.equal('Ceres');
    expect(roci.name).to.equal('Roccinante');
    expect(roci.origin).to.equal('Mars');
  }
}

function checkMutationResponse(response) {
  expect(response.data).to.exist;
  expect(response.data.updateCharacter).to.exist;
  const data = response.data.updateCharacter;
  expect(data.name).to.equal('The Investigator');
  expect(data.profession).to.equal('Zombie Protomolecule Hallucination');
}

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

function checkSubscriptionUpdateAndSpanForParallelRequests(client) {
  return retry(() => {
    const receivedUpdatesClient = client.getIpcMessages();
    expect(receivedUpdatesClient).to.have.lengthOf(3);

    receivedUpdatesClient.forEach(msg => expect(msg).to.match(/"id":"(\d)","name":"Name \d",/));

    return agentControls.getSpans().then(spans => {
      verifySpansForSubscriptionUpdateParallelRequests(spans);
    });
  });
}

function verifySpansForQuery(testConfig, spans) {
  const { resolverType, entityName } = testConfig;
  const httpEntryInClientApp = verifyHttpEntry(null, new RegExp(`/${resolverType}`), spans);
  let exitInClientApp;
  if (testConfig.communicationProtocol === 'http') {
    exitInClientApp = verifyHttpExit(httpEntryInClientApp, /\/graphql/, spans);
  } else if (testConfig.communicationProtocol === 'amqp') {
    exitInClientApp = verifyAmqpExit(httpEntryInClientApp, 'graphql-request-queue', spans);
  } else {
    throw new Error(`Unknown protocol: ${testConfig.communicationProtocol}`);
  }
  const graphQLQueryEntryInServerApp = verifyGraphQLQueryEntry(testConfig, exitInClientApp, spans);
  verifyFollowUpLogExit(graphQLQueryEntryInServerApp, entityName, spans);
}

function verifySpansForMutation(spans) {
  const httpEntryInClientApp = verifyHttpEntry(null, /\/mutation/, spans);
  const httpExitInClientApp = verifyHttpExit(httpEntryInClientApp, /\/graphql/, spans);
  const graphQLMutationEntryInServerApp = verifyGraphQLMutationEntry(httpExitInClientApp, spans);
  verifyFollowUpLogExit(
    graphQLMutationEntryInServerApp,
    'update: 4: The Investigator Zombie Protomolecule Hallucination',
    spans
  );
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

function verifySpansForSubscriptionUpdateParallelRequests(spans) {
  const publishUpdateHttpEntryInClientApp = [];
  for (let i = 0; i < 3; i++) {
    publishUpdateHttpEntryInClientApp[i] = expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.p).to.not.exist,
      span => expect(span.data.http.method).to.equal('POST'),
      span => expect(span.data.http.url).to.match(/\/publish-update-via-http/),
      span => expect(span.data.http.params).to.equal(`id=${i + 1}`)
    ]);
  }

  publishUpdateHttpEntryInClientApp.forEach(httpEntryInClientApp => {
    const httpExitInClientApp = verifyHttpExit(httpEntryInClientApp, /\/publish-update/, spans);
    const entryInServerApp = verifyHttpEntry(httpExitInClientApp, /\/publish-update/, spans);
    expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('graphql.client'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.t).to.equal(entryInServerApp.t),
      span => expect(span.p).to.equal(entryInServerApp.s),
      span => expect(span.data.graphql.operationType).to.equal('subscription-update'),
      span => expect(span.data.graphql.operationName).to.equal('onCharacterUpdated'),
      span => expect(span.data.graphql.fields).to.exist,
      span => expect(span.data.graphql.fields.characterUpdated).to.deep.equal(['id', 'name', 'profession']),
      span => expect(span.data.graphql.args).to.exist,
      span => expect(span.data.graphql.args.characterUpdated).to.deep.equal(['id'])
    ]);
    verifyFollowUpLogExit(entryInServerApp, 'update: 1: Updated Name Updated Profession', spans);
  });
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

function verifyAmqpExit(parentSpan, queueName, spans) {
  return expectExactlyOneMatching(spans, [
    span => expect(span.t).to.equal(parentSpan.t),
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.n).to.equal('rabbitmq'),
    span => expect(span.data.rabbitmq.sort).to.equal('publish'),
    span => expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672'),
    span => expect(span.data.rabbitmq.key).to.equal(queueName)
  ]);
}

function verifyGraphQLQueryEntry(
  { entityName, withError, queryShorthand, multipleEntities, communicationProtocol },
  parentSpan,
  spans
) {
  let expectations = [
    span => expect(span.n).to.equal('graphql.server'),
    span => expect(span.k).to.equal(constants.ENTRY),
    span => expect(span.t).to.equal(parentSpan.t),
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.ts).to.be.a('number'),
    span => expect(span.d).to.be.greaterThan(0),
    span => expect(span.stack).to.be.an('array'),
    span => expect(span.data.graphql).to.exist,
    span => expect(span.data.graphql.operationType).to.equal('query'),
    span => expect(span.postponeTransmit).to.not.exist,
    span => expect(span.postponeTransmitApolloGateway).to.not.exist
  ];

  if (queryShorthand) {
    expectations.push(span => expect(span.data.graphql.operationName).to.not.exist);
  } else {
    expectations.push(span => expect(span.data.graphql.operationName).to.equal('OperationName'));
  }

  if (withError) {
    const isArray = entityName.indexOf('array') === 0;
    if (isArray) {
      expectations = expectations.concat([
        //
        span => expect(span.ec).to.equal(1),
        span => expect(span.error).to.not.exist
      ]);
      if (isArray) {
        expectations.push(span => expect(span.data.graphql.errors).to.equal('Boom, Boom, Boom'));
      } else {
        expectations.push(span => expect(span.data.graphql.errors).to.equal('Boom'));
      }
    } else {
      expectations = expectations.concat([
        span => expect(span.ec).to.equal(1),
        span => expect(span.error).to.not.exist,
        span => expect(span.data.graphql.errors).to.equal('Boom')
      ]);
    }
  } else {
    expectations = expectations.concat([
      span => expect(span.ec).to.equal(0),
      span => expect(span.error).to.not.exist,
      span => expect(span.data.graphql.errors).to.not.exist
    ]);
  }

  expectations = expectations.concat([
    span => expect(span.data.graphql.fields).to.exist,
    span => expect(span.data.graphql.fields[entityName]).to.deep.equal(['id', 'name', 'profession']),
    span => expect(span.data.graphql.args).to.exist,
    span => expect(span.data.graphql.args[entityName]).to.deep.equal(['crewMember'])
  ]);

  if (multipleEntities) {
    expectations = expectations.concat([
      span => expect(span.data.graphql.fields.ships).to.deep.equal(['id', 'name', 'origin']),
      span => expect(span.data.graphql.args.ships).to.not.exist
    ]);
  }

  if (communicationProtocol === 'http') {
    expectations = expectations.concat([
      span => expect(span.data.http).to.be.an('object'),
      span => expect(span.data.http.url).to.match(/\/graphql/),
      span => expect(span.data.http.method).to.equal('POST'),
      span => expect(span.data.http.status).to.equal(200)
    ]);
  } else if (communicationProtocol === 'amqp') {
    expectations = expectations.concat([
      span => expect(span.data.rabbitmq).to.be.an('object'),
      span => expect(span.data.rabbitmq.sort).to.equal('consume'),
      span => expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672'),
      span => expect(span.data.rabbitmq.key).to.equal('graphql-request-queue')
    ]);
  } else {
    throw new Error(`Unknown protocol: ${communicationProtocol}`);
  }
  return expectExactlyOneMatching(spans, expectations);
}

function verifyGraphQLMutationEntry(parentSpan, spans) {
  return expectExactlyOneMatching(spans, [
    span => expect(span.n).to.equal('graphql.server'),
    span => expect(span.k).to.equal(constants.ENTRY),
    span => expect(span.t).to.equal(parentSpan.t),
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.ts).to.be.a('number'),
    span => expect(span.d).to.be.greaterThan(0),
    span => expect(span.stack).to.be.an('array'),
    span => expect(span.data.graphql).to.exist,
    span => expect(span.data.graphql.operationType).to.equal('mutation'),
    span => expect(span.data.graphql.operationName).to.equal('UpdateCharacter'),
    span => expect(span.ec).to.equal(0),
    span => expect(span.error).to.not.exist,
    span => expect(span.data.graphql.errors).to.not.exist,
    span => expect(span.data.graphql.fields).to.exist,
    span => expect(span.data.graphql.args).to.exist,
    span => expect(span.data.graphql.fields.updateCharacter).to.deep.equal(['name', 'profession']),
    span => expect(span.data.graphql.args.updateCharacter).to.deep.equal(['input']),
    span => expect(span.postponeTransmit).to.not.exist,
    span => expect(span.postponeTransmitApolloGateway).to.not.exist,

    span => expect(span.data.http).to.be.an('object'),
    span => expect(span.data.http.url).to.match(/\/graphql/),
    span => expect(span.data.http.method).to.equal('POST'),
    span => expect(span.data.http.status).to.equal(200)
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

module.exports = function (graphqlVersion) {
  return start.bind(this)(graphqlVersion);
};
