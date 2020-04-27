'use strict';

const path = require('path');
const { expect } = require('chai');
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');

let agentControls;

describe('tracing/apollo-federation', function() {
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '8.5.0')) {
    return;
  }

  agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout() * 2);

  [false, true].forEach(withError => registerQuerySuite.bind(this)({ withError }));
  // registerQuerySuite.bind(this)({ withError: false });
});

function registerQuerySuite(testConfig) {
  const { withError } = testConfig;
  describe(`queries (with error: ${withError})`, function() {
    const allControls = startAllProcesses();
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
  agentControls.registerTestHooks();
  const accountServiceControls = new ProcessControls({
    appPath: path.join(__dirname, 'services', 'accounts'),
    port: 4200,
    agentControls
  }).registerTestHooks();
  const inventoryServiceControls = new ProcessControls({
    appPath: path.join(__dirname, 'services', 'inventory'),
    port: 4201,
    agentControls
  }).registerTestHooks();
  const productsServiceControls = new ProcessControls({
    appPath: path.join(__dirname, 'services', 'products'),
    port: 4202,
    agentControls
  }).registerTestHooks();
  const reviewsServiceControls = new ProcessControls({
    appPath: path.join(__dirname, 'services', 'reviews'),
    port: 4203,
    agentControls
  }).registerTestHooks();

  const gatewayControls = new ProcessControls({
    appPath: path.join(__dirname, 'gateway'),
    port: 3217,
    agentControls,
    env: {
      SERVICE_PORT_ACCOUNTS: accountServiceControls.port,
      SERVICE_PORT_INVENTORY: inventoryServiceControls.port,
      SERVICE_PORT_PRODUCTS: productsServiceControls.port,
      SERVICE_PORT_REVIEWS: reviewsServiceControls.port
    }
  }).registerTestHooks();

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'client'),
    port: 3216,
    agentControls,
    env: {
      SERVER_PORT: gatewayControls.port
    }
  }).registerTestHooks();

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
  const httpExitFromClientApp = verifyHttpExit(httpEntryInClientApp, clientControls, 3217, spans);

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
  const httpExitFromGatewayToAccounts = verifyHttpExit(graphQLQueryEntryInGateway, gatewayControls, 4200, spans);
  verifyGraphQLAccountEntry(httpExitFromGatewayToAccounts, allControls, testConfig, spans);

  // In the error test we throw an error in the accounts service. The gateway then aborts processing this GraphQL
  // query and never talks to the other services. Thus, the remaining GraphQL communication only happens in the
  // non-error test case.
  if (!withError) {
    const httpExitFromGatewayToInventory = verifyHttpExit(graphQLQueryEntryInGateway, gatewayControls, 4201, spans);
    verifyGraphQLInventoryEntry(httpExitFromGatewayToInventory, allControls, testConfig, spans);

    const httpExitFromGatewayToProducts = verifyHttpExit(graphQLQueryEntryInGateway, gatewayControls, 4202, spans);
    verifyGraphQLProductsEntry(httpExitFromGatewayToProducts, allControls, testConfig, spans);

    const httpExitFromGatewayToReviews = verifyHttpExit(graphQLQueryEntryInGateway, gatewayControls, 4203, spans);
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
  return testUtils.expectAtLeastOneMatching(spans, span => {
    expect(span.n).to.equal('node.http.server');
    expect(span.k).to.equal(constants.ENTRY);
    expect(span.p).to.not.exist;
    expect(span.f.e).to.equal(String(source.getPid()));
    expect(span.data.http.method).to.equal('POST');
    expect(span.data.http.url).to.equal('/query');
  });
}

function verifyHttpExit(parentSpan, source, targetPort, spans) {
  return testUtils.expectAtLeastOneMatching(spans, span => {
    expect(span.n).to.equal('node.http.client');
    expect(span.k).to.equal(constants.EXIT);
    expect(span.t).to.equal(parentSpan.t);
    expect(span.p).to.equal(parentSpan.s);
    expect(span.f.e).to.equal(String(source.getPid()));
    expect(span.data.http.url).to.match(new RegExp(`${targetPort}/graphql`));
    expect(span.data.http.method).to.equal('POST');
  });
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
