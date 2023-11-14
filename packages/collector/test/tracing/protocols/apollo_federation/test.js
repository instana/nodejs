/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
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

mochaSuiteFn('tracing/apollo-federation', function () {
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpCleanUpHooks();

  const allControls = startAllProcesses();

  [false, true].forEach(withError => registerQuerySuite.bind(this)(allControls, { withError }));
  // registerQuerySuite.bind(this)({ withError: false });
});

function registerQuerySuite(allControls, testConfig) {
  const { withError } = testConfig;
  describe(`queries (with error: ${withError})`, function () {
    it(`must trace a query (with error: ${withError})`, () => testQuery(allControls, testConfig));
  });
}

function testQuery(allControls, testConfig) {
  const { clientControls } = allControls;
  const { withError } = testConfig;
  const queryParams = withError ? 'withError=yes' : null;
  const url = queryParams ? `/query?${queryParams}` : '/query';
  return clientControls
    .sendRequest({
      method: 'POST',
      path: url
    })
    .then(response => {
      verifyQueryResponse(response, testConfig);
      return testUtils.retry(() =>
        agentControls.getSpans().then(verifySpansForQuery.bind(null, allControls, testConfig))
      );
    });
}

function startAllProcesses() {
  const accountServiceControls = new ProcessControls({
    appPath: path.join(__dirname, 'services', 'accounts'),
    useGlobalAgent: true
  });
  const inventoryServiceControls = new ProcessControls({
    appPath: path.join(__dirname, 'services', 'inventory'),
    useGlobalAgent: true
  });
  const productsServiceControls = new ProcessControls({
    appPath: path.join(__dirname, 'services', 'products'),
    useGlobalAgent: true
  });
  const reviewsServiceControls = new ProcessControls({
    appPath: path.join(__dirname, 'services', 'reviews'),
    useGlobalAgent: true
  });

  const gatewayControls = new ProcessControls({
    appPath: path.join(__dirname, 'gateway'),
    useGlobalAgent: true,
    env: {
      SERVICE_PORT_ACCOUNTS: accountServiceControls.getPort(),
      SERVICE_PORT_INVENTORY: inventoryServiceControls.getPort(),
      SERVICE_PORT_PRODUCTS: productsServiceControls.getPort(),
      SERVICE_PORT_REVIEWS: reviewsServiceControls.getPort()
    }
  });

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'client'),
    useGlobalAgent: true,
    env: {
      SERVER_PORT: gatewayControls.getPort()
    }
  });

  // Not using ProcessControls.setUpHooks(...) here because it starts all processes simultaneously, but for Apollo
  // Federation it is necessary to start the processes sequentially and in order.

  before(async () => {
    await accountServiceControls.startAndWaitForAgentConnection();
    await inventoryServiceControls.startAndWaitForAgentConnection();
    await productsServiceControls.startAndWaitForAgentConnection();
    await reviewsServiceControls.startAndWaitForAgentConnection();
    await gatewayControls.startAndWaitForAgentConnection();
    await clientControls.startAndWaitForAgentConnection();
  });
  after(async () => {
    await accountServiceControls.stop();
    await inventoryServiceControls.stop();
    await productsServiceControls.stop();
    await reviewsServiceControls.stop();
    await gatewayControls.stop();
    await clientControls.stop();
  });

  return {
    accountServiceControls,
    inventoryServiceControls,
    productsServiceControls,
    reviewsServiceControls,
    gatewayControls,
    clientControls
  };
}

function verifyQueryResponse(response, testConfig) {
  const { withError } = testConfig;
  expect(response).to.be.an('object');
  expect(response.data).to.be.an('object');
  if (withError) {
    expect(response.data.me).to.be.null;
    expect(response.errors).to.have.lengthOf(1);
    expect(response.errors[0].message).to.equal('Deliberately throwing an error in account service.');
  } else {
    expect(response.errors).to.not.exist;
    const me = response.data.me;
    expect(me).to.be.an('object');
    expect(me.username).to.be.equal('@ada');
    const reviews = me.reviews;
    expect(reviews).to.be.an('array');
    expect(reviews).to.have.lengthOf(2);
    const review1 = reviews[0];
    expect(review1.body).to.equal('Love it!');
    expect(review1.product).to.be.an('object');
    expect(review1.product.name).to.equal('Table');
    expect(review1.product.upc).to.equal('1');
    expect(review1.product.inStock).to.be.true;
    const review2 = reviews[1];
    expect(review2.body).to.equal('Too expensive.');
    expect(review2.product).to.be.an('object');
    expect(review2.product.name).to.equal('Couch');
    expect(review2.product.upc).to.equal('2');
    expect(review2.product.inStock).to.be.false;
  }
}

function verifySpansForQuery(allControls, testConfig, spans) {
  const { gatewayControls, clientControls } = allControls;
  const { withError } = testConfig;
  const httpEntryInClientApp = verifyHttpEntry(clientControls, spans);
  const httpExitFromClientApp = verifyHttpExit(httpEntryInClientApp, clientControls, gatewayControls.getPort(), spans);

  const graphQLQueryEntryInGateway = verifyGraphQLGatewayEntry(
    httpExitFromClientApp,
    allControls,
    // Errors are not propagated automatically from underlying services by @apollo/gateway, so even if a sub call has an
    // error, the root GraphQL call will just have no result, but no error.
    testConfig,
    spans
  );
  // The gateway sends a GraphQL request to each service, thus there There are four HTTP exits from the gateway and four
  // corresponding GraphQL entries - one for each service involved.
  const httpExitFromGatewayToAccounts = verifyHttpExit(
    graphQLQueryEntryInGateway,
    gatewayControls,
    allControls.accountServiceControls.getPort(),
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
      allControls.inventoryServiceControls.getPort(),
      spans
    );
    verifyGraphQLInventoryEntry(httpExitFromGatewayToInventory, allControls, testConfig, spans);

    const httpExitFromGatewayToProducts = verifyHttpExit(
      graphQLQueryEntryInGateway,
      gatewayControls,
      allControls.productsServiceControls.getPort(),
      spans
    );
    verifyGraphQLProductsEntry(httpExitFromGatewayToProducts, allControls, testConfig, spans);

    const httpExitFromGatewayToReviews = verifyHttpExit(
      graphQLQueryEntryInGateway,
      gatewayControls,
      allControls.reviewsServiceControls.getPort(),
      spans
    );
    verifyGraphQLReviewsEntry(httpExitFromGatewayToReviews, allControls, testConfig, spans);
  }

  // Verify there are no unexpected extraneous GraphQL spans:
  const allGraphQLSpans = spans
    .filter(s => s.n === 'graphql.server')
    // reduce span data a bit in case we want to print it out for trouble shooting
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
    }))
    // Ignore GetServiceDefinition and IntrospectionQuery, those are internals of
    // @apollo/federation and @apollo/gateway.
    .filter(
      s =>
        s.data.graphql.operationName !== 'GetServiceDefinition' && s.data.graphql.operationName !== 'IntrospectionQuery'
    );

  const expectedGraphQLSpans = withError ? 2 : 5;
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
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.f.e).to.equal(String(source.getPid())),
    span => expect(span.data.http.url).to.match(new RegExp(`${targetPort}/graphql`)),
    span => expect(span.data.http.method).to.equal('POST')
  ]);
}

function verifyGraphQLGatewayEntry(parentSpan, allControls, testConfig, spans) {
  const { gatewayControls } = allControls;
  return testUtils.expectAtLeastOneMatching(spans, span => {
    verifyGraphQLQueryEntry(span, parentSpan, gatewayControls, testConfig);
    // excludes 'GetServiceDefinition' or 'IntrospectionQuery' queries
    expect(span.data.graphql.operationName).to.not.exist;
    expect(span.data.graphql.fields.me).to.deep.equal(['username', 'reviews']);
    expect(span.data.graphql.args.me).to.deep.equal(['withError']);
  });
}

function verifyGraphQLAccountEntry(parentSpan, allControls, testConfig, spans) {
  const { accountServiceControls } = allControls;
  return testUtils.expectAtLeastOneMatching(spans, span => {
    verifyGraphQLQueryEntry(span, parentSpan, accountServiceControls, testConfig);
    // excludes 'GetServiceDefinition' or 'IntrospectionQuery' queries
    expect(span.data.graphql.operationName).to.not.exist;
    expect(span.data.graphql.fields.me).to.deep.equal(['username', '__typename', 'id']);
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
  expect(span.p).to.equal(parentSpan.s);
  expect(span.f.e).to.equal(String(source.getPid()));
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
