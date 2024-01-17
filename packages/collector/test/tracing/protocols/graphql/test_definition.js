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
  this.timeout(config.getTestTimeout() * 2);

  if (!supportedVersion(process.versions.node)) {
    return;
  }

  describe(`${graphqlVersion}`, () => {
    globalAgent.setUpCleanUpHooks();

    describe('raw GraphQL', () => {
      const { serverControls, clientControls } = createProcesses(false, graphqlVersion);

      registerAllQuerySuiteVariations(serverControls, clientControls, false, 'http');
      registerAllQuerySuiteVariations(serverControls, clientControls, false, 'amqp');
      registerMutationSuite(serverControls, clientControls, false);
      registerSubscriptionOperationNotTracedSuite(serverControls, clientControls, false);
    });

    describe('Apollo', () => {
      const { serverControls, clientControls } = createProcesses(true, graphqlVersion);
      registerAllQuerySuiteVariations(serverControls, clientControls, true, 'http');
      registerMutationSuite(serverControls, clientControls, true);
      registerSubscriptionOperationNotTracedSuite(serverControls, clientControls, true);
    });

    ['http', 'graphql'].forEach(triggerUpdateVia =>
      registerSubscriptionUpdatesAreTracedSuite.bind(this)(triggerUpdateVia, graphqlVersion)
    );

    registerSubscriptionUpdatesCorrectParentSpanSuite('http', graphqlVersion);

    describe('suppressed', () => {
      const { clientControls } = createProcesses(true, graphqlVersion);

      it('should not trace', () =>
        clientControls
          .sendRequest({
            method: 'POST',
            path: '/value',
            suppressTracing: true
          })
          .then(response => {
            checkQueryResponse('value', false, false, response);
            return delay(config.getTestTimeout() / 4);
          })
          .then(() =>
            agentControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(0);
            })
          ));
    });

    describe('disabled', () => {
      const serverControls = new ProcessControls({
        appPath: path.join(__dirname, 'rawGraphQLServer'),
        tracingEnabled: false,
        env: {
          GRAPHQL_VERSION: graphqlVersion
        }
      });
      const clientControls = new ProcessControls({
        appPath: path.join(__dirname, 'client'),
        tracingEnabled: false,
        env: {
          SERVER_PORT: serverControls.getPort(),
          GRAPHQL_VERSION: graphqlVersion
        }
      });

      ProcessControls.setUpHooks(serverControls, clientControls);

      it('should not trace when disabled', () =>
        clientControls
          .sendRequest({
            method: 'POST',
            path: '/value'
          })
          .then(response => {
            checkQueryResponse('value', false, false, response);
            return delay(config.getTestTimeout() / 4);
          })
          .then(() =>
            agentControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(0);
            })
          ));
    });

    describe('individually disabled', () => {
      const serverControls = new ProcessControls({
        appPath: path.join(__dirname, 'rawGraphQLServer'),
        env: {
          INSTANA_DISABLED_TRACERS: 'graphQL',
          GRAPHQL_VERSION: graphqlVersion
        }
      });
      const clientControls = new ProcessControls({
        appPath: path.join(__dirname, 'client'),
        env: {
          SERVER_PORT: serverControls.getPort(),
          GRAPHQL_VERSION: graphqlVersion
        }
      });

      ProcessControls.setUpHooks(serverControls, clientControls);

      it('should not trace graphql when that tracer is disabled individually but still trace all other calls', () =>
        clientControls
          .sendRequest({
            method: 'POST',
            path: '/value'
          })
          .then(response => {
            checkQueryResponse('value', false, false, response);
            return retry(() =>
              agentControls.getSpans().then(spans => {
                const httpEntryInClientApp = verifyHttpEntry(null, /\/value/, spans);
                const httpExitInClientApp = verifyHttpExit(httpEntryInClientApp, /\/graphql/, spans);
                const httpEntryInServerApp = verifyHttpEntry(httpExitInClientApp, /\/graphql/, spans);
                verifyFollowUpLogExit(httpEntryInServerApp, 'value', spans);
                // No graphql span has been recorded but graphql since we have explicitly
                // disabled graphql tracing, but
                // processing has worked (as we have verified via checkQueryResponse).
                expect(getSpansByName(spans, 'graphql.server')).to.be.empty;
                expect(getSpansByName(spans, 'graphql.client')).to.be.empty;
              })
            );
          }));
    });
  });
}

function registerAllQuerySuiteVariations(serverControls, clientControls, apollo, communicationProtocol) {
  const useAlias = Math.random >= 0.5;
  [false, true].forEach(withError =>
    [false, true].forEach(queryShorthand =>
      registerQuerySuite.bind(this)(serverControls, clientControls, {
        apollo,
        withError,
        queryShorthand,
        useAlias,
        communicationProtocol
      })
    )
  );
}

function registerQuerySuite(
  serverControls,
  clientControls,
  { apollo, withError, queryShorthand, useAlias, communicationProtocol }
) {
  const titleSuffix =
    `(${apollo ? 'apollo' : 'raw'}, ` +
    `${withError ? 'with error' : 'without error'}, ` +
    `${queryShorthand ? 'query shorthand' : 'no query shorthand'}, ` +
    `${useAlias ? 'alias' : 'no alias'}, ` +
    `over ${communicationProtocol})`;

  describe(`queries ${titleSuffix}`, function () {
    it(`must trace a query with a value resolver ${titleSuffix}`, () => testQuery('value'));

    it(`must trace a query with a promise resolver ${titleSuffix}`, () => testQuery('promise'));

    it(`must trace a query which resolves to an array of promises ${titleSuffix}`, () => testQuery('array'));

    it(`must trace a query with multiple entities ${titleSuffix}`, () => testQuery('promise', true));
  });

  function testQuery(resolverType, multipleEntities) {
    if (apollo && communicationProtocol === 'amqp') {
      // We do trace this combination (Apollo & AMQP), but the Apollo test app does not connect to AMQP so this
      // scenario is not covered in the regular test suite.
      throw new Error('Test scenario not supported: Apollo & AMQP');
    }

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

        checkQueryResponse(entityNameWithAlias, withError, multipleEntities, response);
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
  }
}

function registerMutationSuite(serverControls, clientControls, apollo) {
  describe(`mutations (${apollo ? 'apollo' : 'raw'})`, function () {
    it(`must trace a mutation (${apollo ? 'apollo' : 'raw'})`, () => testMutation());
  });

  function testMutation() {
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
  }
}

function registerSubscriptionOperationNotTracedSuite(serverControls, clientControls, apollo) {
  describe(`subscriptions (${apollo ? 'apollo' : 'raw'})`, function () {
    it(`must not trace the subscription establishment (${apollo ? 'apollo' : 'raw'})`, () =>
      testSubscriptionIsNotTraced());
  });

  function testSubscriptionIsNotTraced() {
    return clientControls
      .sendRequest({
        method: 'POST',
        path: '/subscription?id=1'
      })
      .then(() => delay(config.getTestTimeout() / 4))
      .then(() =>
        agentControls.getSpans().then(spans => {
          expect(getSpansByName(spans, 'graphql.server')).to.have.lengthOf(0);
          expect(getSpansByName(spans, 'log.pino')).to.have.lengthOf(0);
        })
      );
  }
}

function createProcesses(apollo, version) {
  const serverControls = new ProcessControls({
    appPath: path.join(__dirname, apollo ? 'apolloServer' : 'rawGraphQLServer'),
    env: {
      GRAPHQL_VERSION: version
    }
  });

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'client'),
    env: {
      SERVER_PORT: serverControls.getPort(),
      GRAPHQL_VERSION: version
    }
  });

  ProcessControls.setUpHooks(serverControls, clientControls);

  return { serverControls, clientControls };
}

function registerSubscriptionUpdatesAreTracedSuite(triggerUpdateVia, version) {
  describe(`subscriptions (via: ${triggerUpdateVia})`, function () {
    const serverControls = new ProcessControls({
      appPath: path.join(__dirname, 'apolloServer'),
      env: {
        GRAPHQL_VERSION: version
      }
    });
    // client 1
    const clientControls1 = new ProcessControls({
      appPath: path.join(__dirname, 'client'),
      env: {
        SERVER_PORT: serverControls.getPort(),
        GRAPHQL_VERSION: version
      }
    });
    // client 2
    const clientControls2 = new ProcessControls({
      appPath: path.join(__dirname, 'client'),
      env: {
        SERVER_PORT: serverControls.getPort(),
        GRAPHQL_VERSION: version
      }
    });

    ProcessControls.setUpHooks(serverControls, clientControls1, clientControls2);

    it(`must trace updates for subscriptions (via: ${triggerUpdateVia})`, () =>
      testUpdatesInSubscriptionsAreTraced(clientControls1, clientControls2));
  });

  function testUpdatesInSubscriptionsAreTraced(client1, client2) {
    return (
      Promise.all([
        // subscribe first client
        client1.sendRequest({
          method: 'POST',
          path: '/subscription?id=1'
        }),
        // subscribe second client
        client2.sendRequest({
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
              return client1.sendRequest({
                method: 'POST',
                path: '/publish-update-via-http'
              });
            case 'graphql':
              return client1.sendRequest({
                method: 'POST',
                path: '/publish-update-via-graphql'
              });
            default:
              throw new Error(`Unknown triggerUpdateVia option: ${triggerUpdateVia}`);
          }
        })
        .then(() => checkSubscriptionUpdatesAndSpans(client1, client2, triggerUpdateVia))
    );
  }
}

function registerSubscriptionUpdatesCorrectParentSpanSuite(triggerUpdateVia, version) {
  // This test is currently disabled because it describes a known issue. When the application under monitoring receives
  // multiple concurrent requests with GraphQL mutations, and if there are subscribed clients, all graphql.client/ spans
  // (which represent the subscription update calls from the GraphQL server to the subscribed clients) are
  // attached to the first HTTP entry span, instead of the entry spans that actually triggered them.
  describe.skip('correct parent span for subscription updates', function () {
    const serverControls = new ProcessControls({
      appPath: path.join(__dirname, 'apolloServer'),
      env: {
        GRAPHQL_VERSION: version
      }
    });
    const clientControls = new ProcessControls({
      appPath: path.join(__dirname, 'client'),
      env: {
        SERVER_PORT: serverControls.getPort(),
        GRAPHQL_VERSION: version
      }
    });

    ProcessControls.setUpHooks(serverControls, clientControls);

    it(`must not confuse parent context for parallel request (via: ${triggerUpdateVia})`, () =>
      testParallelRequests(clientControls));
  });

  async function testParallelRequests(client) {
    await // subscribe client
    client.sendRequest({
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
    await Promise.all(requests.map(requestConfig => client.sendRequest(requestConfig)));

    await checkSubscriptionUpdateAndSpanForParallelRequests(client);
  }
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
