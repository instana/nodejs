/* global Promise */

'use strict';

const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const delay = require('../../../../../core/test/test_util/delay');
const utils = require('../../../../../core/test/utils');

let agentControls;
let ClientControls;
let ApolloServerControls;
let RawGraphQLServerControls;

describe('tracing/graphql', function() {
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '8.5.0')) {
    return;
  }

  agentControls = require('../../../apps/agentStubControls');
  ClientControls = require('./clientControls');
  ApolloServerControls = require('./apolloServerControls');
  RawGraphQLServerControls = require('./rawGraphQLServerControls');

  this.timeout(config.getTestTimeout() * 2);

  const useAlias = Math.random >= 0.5;

  [false, true].forEach(apollo =>
    [false, true].forEach(withError =>
      [false, true].forEach(queryShorthand =>
        registerQuerySuite.bind(this)({
          apollo,
          withError,
          queryShorthand,
          useAlias,
          communicationProtocol: 'http'
        })
      )
    )
  );
  // registerQuerySuite.bind(this)({
  //   apollo: true,
  //   withError: false,
  //   queryShorthand: false,
  //   useAlias: false,
  //   communicationProtocol: 'http'
  // });

  // Test GraphQL over AMQP
  registerQuerySuite.bind(this)({
    apollo: false,
    withError: false,
    queryShorthand: false,
    useAlias: false,
    communicationProtocol: 'amqp'
  });

  [false, true].forEach(apollo => registerMutationSuite.bind(this)(apollo));
  // registerMutationSuite.bind(this)(true);

  [false, true].forEach(apollo => registerSubscriptionOperationNotTracedSuite.bind(this)(apollo));
  // registerSubscriptionOperationNotTracedSuite.bind(this)(true);

  ['http', 'graphql'].forEach(triggerUpdateVia =>
    registerSubscriptionUpdatesAreTracedSuite.bind(this)(triggerUpdateVia)
  );
  // registerSubscriptionUpdatesAreTracedSuite.bind(this)('graphql');

  describe('disabled', () => {
    agentControls.registerTestHooks();
    const serverControls = new RawGraphQLServerControls({
      agentControls,
      tracingEnabled: false
    });
    serverControls.registerTestHooks();
    const clientControls = new ClientControls({
      agentControls,
      tracingEnabled: false,
      env: {
        SERVER_PORT: serverControls.port
      }
    });
    clientControls.registerTestHooks();

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

  describe('suppressed', () => {
    agentControls.registerTestHooks();
    const serverControls = new RawGraphQLServerControls({ agentControls });
    serverControls.registerTestHooks();
    const clientControls = new ClientControls({
      agentControls,
      env: {
        SERVER_PORT: serverControls.port
      }
    });
    clientControls.registerTestHooks();

    it('should not trace when suppressed', () =>
      clientControls
        .sendRequest({
          method: 'POST',
          path: '/value',
          headers: {
            'X-INSTANA-L': '0'
          }
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
    agentControls.registerTestHooks();
    const serverControls = new RawGraphQLServerControls({
      agentControls,
      env: {
        INSTANA_DISABLED_TRACERS: 'graphQL'
      }
    });
    serverControls.registerTestHooks();
    const clientControls = new ClientControls({
      agentControls,
      env: {
        SERVER_PORT: serverControls.port
      }
    });
    clientControls.registerTestHooks();

    it('should not trace graphql when that tracer is disabled individually but still trace all other calls', () =>
      clientControls
        .sendRequest({
          method: 'POST',
          path: '/value'
        })
        .then(response => {
          checkQueryResponse('value', false, false, response);
          return utils.retry(() =>
            agentControls.getSpans().then(spans => {
              const httpEntryInClientApp = verifyHttpEntry(null, /\/value/, spans);
              const httpExitInClientApp = verifyHttpExit(httpEntryInClientApp, /\/graphql/, spans);
              const httpEntryInServerApp = verifyHttpEntry(httpExitInClientApp, /\/graphql/, spans);
              verifyFollowUpLogExit(httpEntryInServerApp, 'value', spans);
              // No graphql span has been recorded but graphql since we have explicitly disabled graphql tracing, but
              // processing has worked (as we have verified via checkQueryResponse).
              expect(utils.getSpansByName(spans, 'graphql.server')).to.be.empty;
              expect(utils.getSpansByName(spans, 'graphql.client')).to.be.empty;
            })
          );
        }));
  });
});

function registerQuerySuite({ apollo, withError, queryShorthand, useAlias, communicationProtocol }) {
  const titleSuffix =
    `(${apollo ? 'apollo' : 'raw'}, ` +
    `${withError ? 'with error' : 'without error'}, ` +
    `${queryShorthand ? 'query shorthand' : 'no query shorthand'}, ` +
    `${useAlias ? 'alias' : 'no alias'}, ` +
    `over ${communicationProtocol})`;
  describe(`queries ${titleSuffix}`, function() {
    agentControls.registerTestHooks();
    const serverControls = apollo
      ? new ApolloServerControls({ agentControls })
      : new RawGraphQLServerControls({ agentControls });
    serverControls.registerTestHooks();
    const clientControls = new ClientControls({
      agentControls,
      env: {
        SERVER_PORT: serverControls.port
      }
    });
    clientControls.registerTestHooks();

    it(`must trace a query with a value resolver ${titleSuffix}`, () => testQuery(clientControls, 'value'));

    it(`must trace a query with a promise resolver ${titleSuffix}`, () => testQuery(clientControls, 'promise'));

    it(`must trace a query which resolves to an array of promises ${titleSuffix}`, () =>
      testQuery(clientControls, 'array'));

    it(`must trace a query with multiple entities ${titleSuffix}`, () => testQuery(clientControls, 'promise', true));
  });

  function testQuery(clientControls, resolverType, multipleEntities) {
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
        return utils.retry(() =>
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

function registerMutationSuite(apollo) {
  describe(`mutations (${apollo ? 'apollo' : 'raw'})`, function() {
    agentControls.registerTestHooks();
    const serverControls = apollo
      ? new ApolloServerControls({ agentControls })
      : new RawGraphQLServerControls({ agentControls });
    serverControls.registerTestHooks();
    const clientControls = new ClientControls({
      agentControls,
      env: {
        SERVER_PORT: serverControls.port
      }
    });
    clientControls.registerTestHooks();

    it(`must trace a mutation (${apollo ? 'apollo' : 'raw'})`, () => testMutation(clientControls));
  });

  function testMutation(clientControls) {
    const url = '/mutation';
    return clientControls
      .sendRequest({
        method: 'POST',
        path: url
      })
      .then(response => {
        checkMutationResponse(response);
        return utils.retry(() => agentControls.getSpans().then(verifySpansForMutation));
      });
  }
}

function registerSubscriptionOperationNotTracedSuite(apollo) {
  describe(`subscriptions (${apollo ? 'apollo' : 'raw'})`, function() {
    agentControls.registerTestHooks();
    const serverControls = apollo
      ? new ApolloServerControls({ agentControls })
      : new RawGraphQLServerControls({ agentControls });
    serverControls.registerTestHooks();
    const clientControls = new ClientControls({
      agentControls,
      env: {
        SERVER_PORT: serverControls.port
      }
    });
    clientControls.registerTestHooks();

    it(`must not trace the subscription establishment (${apollo ? 'apollo' : 'raw'})`, () =>
      testSubscriptionIsNotTraced(clientControls));
  });

  function testSubscriptionIsNotTraced(clientControls) {
    return clientControls
      .sendRequest({
        method: 'POST',
        path: '/subscription?id=1'
      })
      .then(() => delay(config.getTestTimeout() / 4))
      .then(() =>
        agentControls.getSpans().then(spans => {
          expect(utils.getSpansByName(spans, 'graphql.server')).to.have.lengthOf(0);
          expect(utils.getSpansByName(spans, 'log.pino')).to.have.lengthOf(0);
        })
      );
  }
}

function registerSubscriptionUpdatesAreTracedSuite(triggerUpdateVia) {
  describe(`subscriptions (via: ${triggerUpdateVia})`, function() {
    agentControls.registerTestHooks();
    const serverControls = new ApolloServerControls({ agentControls });
    serverControls.registerTestHooks();
    // client 1
    const clientControls1 = new ClientControls({
      agentControls,
      env: {
        SERVER_PORT: serverControls.port
      }
    });
    clientControls1.registerTestHooks();
    // client 2
    const clientControls2 = new ClientControls({
      agentControls,
      port: 3226,
      env: {
        SERVER_PORT: serverControls.port
      }
    });
    clientControls2.registerTestHooks();

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
  return utils.retry(() => {
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

  const graphQLSubscriptionUpdateExits = utils.getSpansByName(spans, 'graphql.client');
  expect(graphQLSubscriptionUpdateExits).to.have.lengthOf(2);
  graphQLSubscriptionUpdateExits.forEach(exitSpan => verifyGraphQLSubscriptionUpdateExit(entryInServerApp, exitSpan));
  verifyFollowUpLogExit(entryInServerApp, 'update: 1: Updated Name Updated Profession', spans);
}

function verifyHttpEntry(parentSpan, urlRegex, spans) {
  return utils.expectOneMatching(spans, span => {
    expect(span.n).to.equal('node.http.server');
    expect(span.k).to.equal(constants.ENTRY);
    if (parentSpan) {
      expect(span.t).to.equal(parentSpan.t);
      expect(span.p).to.equal(parentSpan.s);
    } else {
      expect(span.p).to.not.exist;
    }
    expect(span.data.http.method).to.equal('POST');
    expect(span.data.http.url).to.match(urlRegex);
  });
}

function verifyHttpExit(parentSpan, urlRegex, spans) {
  return utils.expectOneMatching(spans, span => {
    expect(span.n).to.equal('node.http.client');
    expect(span.k).to.equal(constants.EXIT);
    expect(span.t).to.equal(parentSpan.t);
    expect(span.p).to.equal(parentSpan.s);
    expect(span.data.http.url).to.match(urlRegex);
    expect(span.data.http.method).to.equal('POST');
  });
}

function verifyAmqpExit(parentSpan, queueName, spans) {
  return utils.expectOneMatching(spans, span => {
    expect(span.t).to.equal(parentSpan.t);
    expect(span.p).to.equal(parentSpan.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.n).to.equal('rabbitmq');
    expect(span.data.rabbitmq.sort).to.equal('publish');
    expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
    expect(span.data.rabbitmq.key).to.equal(queueName);
  });
}

function verifyGraphQLQueryEntry(
  { entityName, withError, queryShorthand, multipleEntities, communicationProtocol },
  parentSpan,
  spans
) {
  return utils.expectOneMatching(spans, span => {
    expect(span.n).to.equal('graphql.server');
    expect(span.k).to.equal(constants.ENTRY);
    expect(span.t).to.equal(parentSpan.t);
    expect(span.p).to.equal(parentSpan.s);
    expect(span.ts).to.be.a('number');
    expect(span.d).to.be.greaterThan(0);
    expect(span.stack).to.be.an('array');

    expect(span.data.graphql).to.exist;
    expect(span.data.graphql.operationType).to.equal('query');
    if (queryShorthand) {
      expect(span.data.graphql.operationName).to.not.exist;
    } else {
      expect(span.data.graphql.operationName).to.equal('OperationName');
    }

    if (withError) {
      const isArray = entityName.indexOf('array') === 0;
      if (isArray) {
        expect(span.ec).to.equal(isArray ? 3 : 1);
        expect(span.error).to.be.true;
        if (isArray) {
          expect(span.data.graphql.errors).to.equal('Boom, Boom, Boom');
        } else {
          expect(span.data.graphql.errors).to.equal('Boom');
        }
      } else {
        expect(span.ec).to.equal(1);
        expect(span.error).to.be.true;
        expect(span.data.graphql.errors).to.equal('Boom');
      }
    } else {
      expect(span.ec).to.equal(0);
      expect(span.error).to.be.false;
      expect(span.data.graphql.errors).to.not.exist;
    }

    expect(span.data.graphql.fields).to.exist;
    expect(span.data.graphql.fields[entityName]).to.deep.equal(['id', 'name', 'profession']);
    expect(span.data.graphql.args).to.exist;
    expect(span.data.graphql.args[entityName]).to.deep.equal(['crewMember']);

    if (multipleEntities) {
      expect(span.data.graphql.fields.ships).to.deep.equal(['id', 'name', 'origin']);
      expect(span.data.graphql.args.ships).to.not.exist;
    }

    if (communicationProtocol === 'http') {
      expect(span.data.http).to.be.an('object');
      expect(span.data.http.url).to.match(/\/graphql/);
      expect(span.data.http.method).to.equal('POST');
    } else if (communicationProtocol === 'amqp') {
      expect(span.data.rabbitmq).to.be.an('object');
      expect(span.data.rabbitmq.sort).to.equal('consume');
      expect(span.data.rabbitmq.address).to.equal('amqp://127.0.0.1:5672');
      expect(span.data.rabbitmq.key).to.equal('graphql-request-queue');
    } else {
      throw new Error(`Unknown protocol: ${communicationProtocol}`);
    }
  });
}

function verifyGraphQLMutationEntry(parentSpan, spans) {
  return utils.expectOneMatching(spans, span => {
    expect(span.n).to.equal('graphql.server');
    expect(span.k).to.equal(constants.ENTRY);
    expect(span.t).to.equal(parentSpan.t);
    expect(span.p).to.equal(parentSpan.s);
    expect(span.ts).to.be.a('number');
    expect(span.d).to.be.greaterThan(0);
    expect(span.stack).to.be.an('array');
    expect(span.data.graphql).to.exist;
    expect(span.data.graphql.operationType).to.equal('mutation');
    expect(span.data.graphql.operationName).to.equal('UpdateCharacter');
    expect(span.ec).to.equal(0);
    expect(span.error).to.be.false;
    expect(span.data.graphql.errors).to.not.exist;
    expect(span.data.graphql.fields).to.exist;
    expect(span.data.graphql.args).to.exist;
    expect(span.data.graphql.fields.updateCharacter).to.deep.equal(['name', 'profession']);
    expect(span.data.graphql.args.updateCharacter).to.deep.equal(['input']);

    expect(span.data.http).to.be.an('object');
    expect(span.data.http.url).to.match(/\/graphql/);
    expect(span.data.http.method).to.equal('POST');
  });
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
  expect(span.error).to.be.false;
  expect(span.data.graphql.errors).to.not.exist;
  expect(span.data.graphql.fields).to.exist;
  expect(span.data.graphql.fields.characterUpdated).to.deep.equal(['id', 'name', 'profession']);
  expect(span.data.graphql.args).to.exist;
  expect(span.data.graphql.args.characterUpdated).to.deep.equal(['id']);
}

function verifyFollowUpLogExit(parentSpan, expectedMessage, spans) {
  return utils.expectOneMatching(spans, span => {
    expect(span.n).to.equal('log.pino');
    expect(span.k).to.equal(constants.EXIT);
    expect(span.t).to.equal(parentSpan.t);
    expect(span.p).to.equal(parentSpan.s);
    expect(span.data.log.message).to.equal(expectedMessage);
  });
}
