/*
 * (c) Copyright IBM Corp. 2021
 */

'use strict';

const path = require('path');
const { expect } = require('chai');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn.only('tracing gateway with apollo-subgraph', function () {
  this.timeout(config.getTestTimeout() * 5);
  globalAgent.setUpCleanUpHooks();

  [true, false].forEach(withError => {
    describe(`queries (with error: ${withError})`, function () {
      let accountServiceControls;
      let inventoryServiceControls;
      let productsServiceControls;
      let reviewsServiceControls;
      let gatewayControls;
      let clientControls;

      before(async () => {
        accountServiceControls = new ProcessControls({
          appPath: path.join(__dirname, 'services', 'accounts'),
          useGlobalAgent: true
        });
        inventoryServiceControls = new ProcessControls({
          appPath: path.join(__dirname, 'services', 'inventory'),
          useGlobalAgent: true
        });
        productsServiceControls = new ProcessControls({
          appPath: path.join(__dirname, 'services', 'products'),
          useGlobalAgent: true
        });
        reviewsServiceControls = new ProcessControls({
          appPath: path.join(__dirname, 'services', 'reviews'),
          useGlobalAgent: true
        });
        gatewayControls = new ProcessControls({
          appPath: path.join(__dirname, 'gateway'),
          useGlobalAgent: true,
          env: {
            SERVICE_PORT_ACCOUNTS: accountServiceControls.getPort(),
            SERVICE_PORT_INVENTORY: inventoryServiceControls.getPort(),
            SERVICE_PORT_PRODUCTS: productsServiceControls.getPort(),
            SERVICE_PORT_REVIEWS: reviewsServiceControls.getPort()
          }
        });
        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'client'),
          useGlobalAgent: true,
          env: {
            SERVER_PORT: gatewayControls.getPort()
          }
        });

        await accountServiceControls.startAndWaitForAgentConnection();
        await inventoryServiceControls.startAndWaitForAgentConnection();
        await productsServiceControls.startAndWaitForAgentConnection();
        await reviewsServiceControls.startAndWaitForAgentConnection();
        await gatewayControls.startAndWaitForAgentConnection();
        await clientControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await accountServiceControls.stop();
        await inventoryServiceControls.stop();
        await productsServiceControls.stop();
        await reviewsServiceControls.stop();
        await gatewayControls.stop();
        await clientControls.stop();
      });

      it(`must trace a query (with error: ${withError})`, () => {
        const queryParams = withError ? 'withError=yes' : null;
        const url = queryParams ? `/query?${queryParams}` : '/query';

        return clientControls
          .sendRequest({
            method: 'POST',
            path: url
          })
          .then(response => {
            verifyQueryResponse(response, { withError });

            return testUtils.retry(() => {
              return agentControls.getSpans().then(spans => {
                if (withError) {
                  expect(spans.length).to.equal(5);
                } else {
                  expect(spans.length).to.equal(11);
                }
                return verifySpansForQuery(
                  {
                    gatewayControls,
                    clientControls,
                    inventoryServiceControls,
                    accountServiceControls,
                    reviewsServiceControls,
                    productsServiceControls
                  },
                  { withError },
                  spans
                );
              });
            });
          });
      });
    });
  });
});

function verifyQueryResponse(response, testConfig) {
  const { withError } = testConfig;
  expect(response).to.be.an('object');

  if (withError) {
    expect(response.errors).to.have.lengthOf(1);
  } else {
    const { data } = response;
    expect(data).to.be.an('object');
    const { me } = data;
    expect(me)
      .to.be.an('object')
      .that.deep.includes({
        username: '@ada',
        reviews: [
          { body: 'Love it!', product: { name: 'Table', upc: '1', inStock: true } },
          { body: 'Too expensive.', product: { name: 'Couch', upc: '2', inStock: false } }
        ]
      });
  }
}

function verifySpansForQuery(allControls, testConfig, spans) {
  const {
    gatewayControls,
    reviewsServiceControls,
    productsServiceControls,
    clientControls,
    inventoryServiceControls,
    accountServiceControls
  } = allControls;

  const { withError } = testConfig;
  const httpEntryInClientApp = verifyHttpEntry(clientControls, spans);
  const httpExitFromClientApp = verifyHttpExit(httpEntryInClientApp, clientControls, gatewayControls.getPort(), spans);
  const graphQLQueryEntryInGateway = verifyGraphQLGatewayEntry(httpExitFromClientApp, allControls, testConfig, spans);

  // The gateway sends a GraphQL request to each service, thus there There are four HTTP exits from the gateway and four
  // corresponding GraphQL entries - one for each service involved.
  const httpExitFromGatewayToAccounts = verifyHttpExit(
    graphQLQueryEntryInGateway,
    gatewayControls,
    accountServiceControls.getPort(),
    spans
  );

  verifyGraphQLAccountEntry(httpExitFromGatewayToAccounts, allControls, testConfig, spans);

  // In the error test we throw an error in the accounts service. The gateway then aborts processing this GraphQL
  // query and never talks to the other services. Thus, the remaining GraphQL communication only happens in the
  // non-error test case.
  if (!withError) {
    const httpExitFromGatewayToInventory = verifyHttpExit(
      graphQLQueryEntryInGateway,
      gatewayControls,
      inventoryServiceControls.getPort(),
      spans
    );
    verifyGraphQLInventoryEntry(httpExitFromGatewayToInventory, allControls, testConfig, spans);

    const httpExitFromGatewayToProducts = verifyHttpExit(
      graphQLQueryEntryInGateway,
      gatewayControls,
      productsServiceControls.getPort(),
      spans
    );
    verifyGraphQLProductsEntry(httpExitFromGatewayToProducts, allControls, testConfig, spans);

    const httpExitFromGatewayToReviews = verifyHttpExit(
      graphQLQueryEntryInGateway,
      gatewayControls,
      reviewsServiceControls.getPort(),
      spans
    );
    verifyGraphQLReviewsEntry(httpExitFromGatewayToReviews, allControls, testConfig, spans);
  }

  // Verify there are no unexpected extraneous GraphQL spans:
  const allGraphQLSpans = spans
    .filter(s => s.n === 'graphql.server')
    .filter(s => !['GetServiceDefinition', 'IntrospectionQuery'].includes(s.data.graphql.operationName))
    .map(s => ({
      n: s.n,
      t: s.t,
      s: s.s,
      p: s.p,
      k: s.k,
      f: s.f,
      ec: s.ec,
      error: s.error,
      data: s.data
    }));
  const expectedGraphQLSpans = withError ? 1 : 4;
  if (allGraphQLSpans.length !== expectedGraphQLSpans) {
    // eslint-disable-next-line no-console
    allGraphQLSpans.forEach(s => console.log(JSON.stringify(s, null, 2)));
  }
  expect(allGraphQLSpans).to.have.lengthOf(expectedGraphQLSpans);
}

function verifyHttpEntry(source, spans) {
  return testUtils.expectAtLeastOneMatching(spans, [
    span => expect(span.n).to.equal('node.http.server'),
    span => expect(span.k).to.equal(constants.ENTRY),
    span => expect(span.p).to.not.exist,
    span => expect(span.f.e).to.equal(String(source.getPid())),
    span => expect(span.data.http.method).to.equal('POST'),
    span => expect(span.data.http.url).to.equal('/query')
  ]);
}

function verifyHttpExit(parentSpan, source, targetPort, spans) {
  return testUtils.expectAtLeastOneMatching(spans, [
    span => expect(span.n).to.equal('node.http.client'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.t).to.equal(parentSpan.t),
    span => expect(span.f.e).to.equal(String(source.getPid())),
    span => expect(span.data.http.url).to.match(new RegExp(`${targetPort}/graphql`)),
    span => expect(span.data.http.method).to.equal('POST')
  ]);
}

function verifyGraphQLGatewayEntry(parentSpan, allControls, testConfig, spans) {
  const { gatewayControls } = allControls;
  const entrySpans = spans.filter(span => span.k === 1 && span.n === 'graphql.server');
  return testUtils.expectAtLeastOneMatching(entrySpans, span => {
    verifyGraphQLQueryEntry(span, parentSpan, gatewayControls, testConfig);
    // excludes 'GetServiceDefinition' or 'IntrospectionQuery' queries
    expect(span.data.graphql.operationName).to.not.exist;
    expect(span.data.graphql.fields.me).to.deep.equal(['__typename', 'id', 'username']);
    expect(span.data.graphql.args.me).to.deep.equal(['withError']);
  });
}

function verifyGraphQLAccountEntry(parentSpan, allControls, testConfig, spans) {
  const { accountServiceControls } = allControls;
  return testUtils.expectAtLeastOneMatching(spans, span => {
    verifyGraphQLQueryEntry(span, parentSpan, accountServiceControls, testConfig);
    // excludes 'GetServiceDefinition' or 'IntrospectionQuery' queries
    expect(span.data.graphql.operationName).to.not.exist;
    expect(span.data.graphql.fields.me).to.deep.equal(['__typename', 'id', 'username']);
    expect(span.data.graphql.args.me).to.deep.equal(['withError']);
  });
}

function verifyGraphQLInventoryEntry(parentSpan, allControls, testConfig, spans) {
  const { inventoryServiceControls } = allControls;
  return testUtils.expectAtLeastOneMatching(spans, span => {
    verifyGraphQLQueryEntry(span, parentSpan, inventoryServiceControls, testConfig);
    // excludes 'GetServiceDefinition' or 'IntrospectionQuery' queries
    expect(span.data.graphql.operationName).to.not.exist;
    expect(span.data.graphql.fields._entities).to.deep.equal([]);
    expect(span.data.graphql.args._entities).to.deep.equal(['representations']);
  });
}

function verifyGraphQLProductsEntry(parentSpan, allControls, testConfig, spans) {
  const { productsServiceControls } = allControls;
  return testUtils.expectAtLeastOneMatching(spans, span => {
    verifyGraphQLQueryEntry(span, parentSpan, productsServiceControls, testConfig);
    // excludes 'GetServiceDefinition' or 'IntrospectionQuery' queries
    expect(span.data.graphql.operationName).to.not.exist;
    expect(span.data.graphql.fields._entities).to.deep.equal([]);
    expect(span.data.graphql.args._entities).to.deep.equal(['representations']);
  });
}

function verifyGraphQLReviewsEntry(parentSpan, allControls, testConfig, spans) {
  const { reviewsServiceControls } = allControls;
  return testUtils.expectAtLeastOneMatching(spans, span => {
    verifyGraphQLQueryEntry(span, parentSpan, reviewsServiceControls, testConfig);
    // excludes 'GetServiceDefinition' or 'IntrospectionQuery' queries
    expect(span.data.graphql.operationName).to.not.exist;
    expect(span.data.graphql.fields._entities).to.deep.equal([]);
    expect(span.data.graphql.args._entities).to.deep.equal(['representations']);
  });
}

function verifyGraphQLQueryEntry(span, parentSpan, source, testConfig) {
  const { withError } = testConfig;
  expect(span.n).to.equal('graphql.server');
  expect(span.k).to.equal(constants.ENTRY);
  expect(span.t).to.equal(parentSpan.t);
  expect(span.ts).to.be.a('number');
  expect(span.d).to.be.a('number');
  expect(span.stack).to.be.an('array');
  expect(span.data.graphql).to.exist;
  expect(span.data.graphql.operationType).to.equal('query');

  if (withError) {
    expect(span.ec).to.equal(1);
    expect(span.error).to.not.exist;
    expect(span.data.graphql.errors).to.equal('Deliberately throwing an error in account service.');
  } else {
    expect(span.ec).to.equal(0);
    expect(span.error).to.not.exist;
    expect(span.data.graphql.errors).to.not.exist;
  }
}
