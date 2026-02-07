/*
 * (c) Copyright IBM Corp. 2021
 */

'use strict';

const { expect } = require('chai');

const constants = require('@_instana/core').tracing.constants;
const config = require('@_instana/core/test/config');
const testUtils = require('@_instana/core/test/test_util');
const ProcessControls = require('@_instana/collector/test/test_util/ProcessControls');
const globalAgent = require('@_instana/collector/test/globalAgent');

const agentControls = globalAgent.instance;

module.exports = function (name, version, isLatest) {
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
        const commonEnv = {
          LIBRARY_LATEST: isLatest,
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name
        };

        accountServiceControls = new ProcessControls({
          dirname: __dirname,
          appName: 'services/accounts/index.js',
          useGlobalAgent: true,
          env: commonEnv
        });
        inventoryServiceControls = new ProcessControls({
          dirname: __dirname,
          appName: 'services/inventory/index.js',
          useGlobalAgent: true,
          env: commonEnv
        });
        productsServiceControls = new ProcessControls({
          dirname: __dirname,
          appName: 'services/products/index.js',
          useGlobalAgent: true,
          env: commonEnv
        });
        reviewsServiceControls = new ProcessControls({
          dirname: __dirname,
          appName: 'services/reviews/index.js',
          useGlobalAgent: true,
          env: commonEnv
        });
        gatewayControls = new ProcessControls({
          dirname: __dirname,
          appName: 'gateway.js',
          useGlobalAgent: true,
          env: {
            ...commonEnv,
            SERVICE_PORT_ACCOUNTS: accountServiceControls.getPort(),
            SERVICE_PORT_INVENTORY: inventoryServiceControls.getPort(),
            SERVICE_PORT_PRODUCTS: productsServiceControls.getPort(),
            SERVICE_PORT_REVIEWS: reviewsServiceControls.getPort()
          }
        });
        clientControls = new ProcessControls({
          dirname: __dirname,
          appName: 'client.js',
          useGlobalAgent: true,
          env: {
            ...commonEnv,
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
            expect(response).to.be.an('object');

            if (withError) {
              expect(response.errors).to.have.lengthOf(1);
            } else {
              expect(response.data.me.username).to.equal('@ada');
            }

            return testUtils.retry(() => {
              return agentControls.getSpans().then(spans => {
                // Verify HTTP entry in client app
                const httpEntry = testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.f.e).to.equal(String(clientControls.getPid())),
                  span => expect(span.data.http.url).to.equal('/query')
                ]);

                // Verify HTTP exit from client to gateway
                const httpExit = testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.t).to.equal(httpEntry.t),
                  span => expect(span.data.http.url).to.match(new RegExp(`${gatewayControls.getPort()}/graphql`))
                ]);

                // Verify GraphQL entry at gateway
                const graphqlSpans = spans.filter(
                  s =>
                    s.n === 'graphql.server' &&
                    !['GetServiceDefinition', 'IntrospectionQuery'].includes(s.data.graphql.operationName)
                );

                testUtils.expectAtLeastOneMatching(graphqlSpans, [
                  span => expect(span.n).to.equal('graphql.server'),
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.t).to.equal(httpExit.t),
                  span => expect(span.data.graphql.operationType).to.equal('query'),
                  span => {
                    if (withError) {
                      expect(span.ec).to.equal(1);
                    } else {
                      expect(span.ec).to.equal(0);
                    }
                  }
                ]);
              });
            });
          });
      });
    });
  });
};
