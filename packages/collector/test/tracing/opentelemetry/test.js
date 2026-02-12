/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const semver = require('semver');
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const portfinder = require('../../test_util/portfinder');
const { execSync } = require('child_process');
const {
  retry,
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyIntermediateSpan,
  verifyEntrySpan,
  expectExactlyNMatching,
  delay,
  expectExactlyOneMatching
} = require('@_local/core/test/test_util');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');
const DELAY_TIMEOUT_IN_MS = 500;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;
const agentControls = globalAgent.instance;

mochaSuiteFn('opentelemetry tests', function () {
  this.timeout(config.getTestTimeout() * 2.5);

  globalAgent.setUpCleanUpHooks();

  before(() => {
    if (process.env.INSTANA_TEST_SKIP_INSTALLING_DEPS === 'true') {
      return;
    }

    execSync('rm -rf package-lock.json', { cwd: __dirname, stdio: 'inherit' });
    execSync('rm -rf package.json', { cwd: __dirname, stdio: 'inherit' });
    execSync('rm -rf node_modules', { cwd: __dirname, stdio: 'inherit' });
    execSync('rm -rf collector.tgz', { cwd: __dirname, stdio: 'inherit' });
    execSync('rm -rf core.tgz', { cwd: __dirname, stdio: 'inherit' });
    execSync('./preinstall.sh', { cwd: __dirname, stdio: 'inherit' });
  });

  // We run tests against multiple @opentelemetry/api versions to ensure compatibility.
  //
  // The core package declares a peer dependency range: ">=1.3.0 <1.10.0".
  // This allows reusing the customer's existing API version if it falls within that range,
  // instead of always installing our own copy. It helps avoid multiple conflicting instances.
  //
  // To verify stability across the supported range, we test with both v1.3.0 and v1.9.0:
  // - v1.3.0 represents the lowest supported version.
  // - latest is the latest verified release.
  ['latest', 'v1.3.0'].forEach(version => {
    mochaSuiteFn(`opentelemetry/instrumentations using @opentelemetry/api version: ${version}`, function () {
      before(() => {
        if (process.env.INSTANA_TEST_SKIP_INSTALLING_DEPS === 'true') {
          return;
        }

        execSync('npm install --save --prefix ./ ./core.tgz', {
          cwd: __dirname,
          stdio: 'inherit'
        });

        // eslint-disable-next-line no-console
        console.log('Installed core.tgz');

        execSync('npm install --save --prefix ./ ./collector.tgz', {
          cwd: __dirname,
          stdio: 'inherit'
        });

        // eslint-disable-next-line no-console
        console.log('Installed collector.tgz');

        execSync('npm install --save --prefix ./ @opentelemetry/api@1.9.0', {
          cwd: __dirname,
          stdio: 'inherit'
        });

        // eslint-disable-next-line no-console
        console.log('Installed @opentelemetry/api@1.9.0');

        execSync('npm install --save --prefix ./ "@opentelemetry/api-v1.3.0@npm:@opentelemetry/api@1.3.0"', {
          cwd: __dirname,
          stdio: 'inherit'
        });

        // eslint-disable-next-line no-console
        console.log('Installed @opentelemetry/api-v1.3.0@npm:@opentelemetry/api@1.3.0');
      });

      // node bin/start-test-containers.js --zookeeper --kafka --schema-registry --kafka-topics
      // Note: Node v25 does not currently support confluent-kafka
      //       https://github.com/confluentinc/confluent-kafka-javascript/issues/397
      const confluentKafkaSuiteFn = semver.satisfies(process.versions.node, '>=25.x') ? describe.skip : describe;

      confluentKafkaSuiteFn('tracing/confluent-kafka', function () {
        const topic = 'confluent-kafka-topic';

        before(async () => {
          if (process.env.INSTANA_TEST_SKIP_INSTALLING_DEPS !== 'true') {
            const rootPackageJson = require('../../../../../package.json');
            const confluentKafkaVersion =
              rootPackageJson.optionalDependencies['@confluentinc/kafka-javascript'] ||
              rootPackageJson.devDependencies['@confluentinc/kafka-javascript'];
            execSync(`npm i "@confluentinc/kafka-javascript@${confluentKafkaVersion}" --prefix ./ --save`, {
              cwd: __dirname,
              stdio: 'inherit'
            });

            // eslint-disable-next-line no-console
            console.log('Installed kafka-javascript');
          }
        });

        describe('kafkajs style', function () {
          let consumerControls;
          let producerControls;

          before(async () => {
            producerControls = new ProcessControls({
              appPath: path.join(__dirname, 'confluent-kafka-producer-app.js'),
              useGlobalAgent: true,
              cwd: __dirname,
              enableOtelIntegration: true,
              esmLoaderPath: path.join(__dirname, 'node_modules', '@instana', 'collector', 'esm-register.mjs'),
              env: {
                CONFLUENT_KAFKA_TOPIC: topic
              }
            });

            await producerControls.startAndWaitForAgentConnection();

            consumerControls = new ProcessControls({
              appPath: path.join(__dirname, 'confluent-kafka-consumer-app.js'),
              useGlobalAgent: true,
              enableOtelIntegration: true,
              esmLoaderPath: path.join(__dirname, 'node_modules', '@instana', 'collector', 'esm-register.mjs'),
              env: {
                CONFLUENT_KAFKA_TOPIC: topic
              }
            });

            await consumerControls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await consumerControls.stop();
            await producerControls.stop();
          });

          afterEach(async () => {
            await consumerControls.clearIpcMessages();
            await producerControls.clearIpcMessages();
          });

          const apiPath = '/produce';

          it('produces and consumes a message', async () => {
            const response = await producerControls.sendRequest({
              method: 'GET',
              path: apiPath
            });

            expect(response.produced).to.equal(true);

            return retry(() => {
              return agentControls.getSpans().then(spans => {
                expect(spans.length).to.equal(4);

                const httpEntry = verifyHttpRootEntry({
                  spans,
                  apiPath: '/produce',
                  pid: String(producerControls.getPid())
                });

                const producerExit = verifyExitSpan({
                  spanName: 'otel',
                  spans,
                  parent: httpEntry,
                  withError: false,
                  pid: String(producerControls.getPid()),
                  dataProperty: 'tags',
                  extraTests: span => {
                    expect(span.t).to.equal(httpEntry.t);
                    expect(span.data.tags.name).to.eql('confluent-kafka-topic');
                    expect(span.data.tags['messaging.system']).to.equal('kafka');
                    expect(span.data.tags['messaging.operation.name']).to.equal('send');
                    expect(span.d).to.be.greaterThan(2);
                    checkTelemetryResourceAttrs(span);
                  }
                });

                const consumerEntry = verifyEntrySpan({
                  spanName: 'otel',
                  spans,
                  withError: false,
                  pid: String(consumerControls.getPid()),
                  dataProperty: 'tags',
                  extraTests: span => {
                    expect(span.t).to.equal(httpEntry.t);
                    expect(span.p).to.equal(producerExit.s);
                    expect(span.data.tags.name).to.eql('confluent-kafka-topic');
                    expect(span.data.tags['messaging.system']).to.equal('kafka');
                    expect(span.data.tags['messaging.operation.type']).to.equal('receive');
                    expect(span.d).to.be.greaterThan(2);
                    checkTelemetryResourceAttrs(span);
                  }
                });

                verifyHttpExit(spans, consumerEntry);
              });
            });
          });

          it('[suppressed] must not trace', async () => {
            const response = await producerControls.sendRequest({
              method: 'GET',
              path: apiPath,
              suppressTracing: true
            });

            expect(response.produced).to.equal(true);

            await delay(1000 * 5);

            return retry(async () => {
              const spans = await agentControls.getSpans();
              expect(spans).to.have.lengthOf(0);
            });
          });
        });

        describe('rdkafka style', function () {
          let consumerControls;
          let producerControls;

          before(async () => {
            producerControls = new ProcessControls({
              appPath: path.join(__dirname, 'confluent-kafka-producer-app.js'),
              useGlobalAgent: true,
              cwd: __dirname,
              enableOtelIntegration: true,
              esmLoaderPath: path.join(__dirname, 'node_modules', '@instana', 'collector', 'esm-register.mjs'),
              env: {
                CONFLUENT_KAFKA_TOPIC: topic,
                KAFKA_CLIENT_TYPE: 'rdkafka'
              }
            });

            await producerControls.startAndWaitForAgentConnection();

            consumerControls = new ProcessControls({
              appPath: path.join(__dirname, 'confluent-kafka-consumer-app.js'),
              useGlobalAgent: true,
              enableOtelIntegration: true,
              esmLoaderPath: path.join(__dirname, 'node_modules', '@instana', 'collector', 'esm-register.mjs'),
              env: {
                CONFLUENT_KAFKA_TOPIC: topic,
                KAFKA_CLIENT_TYPE: 'rdkafka'
              }
            });

            await consumerControls.startAndWaitForAgentConnection(1000, Date.now() + 1000 * 10);
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await consumerControls.stop();
            await producerControls.stop();
          });

          afterEach(async () => {
            await consumerControls.clearIpcMessages();
            await producerControls.clearIpcMessages();
          });

          const apiPath = '/produce';

          it('produces and consumes a message', async () => {
            const response = await producerControls.sendRequest({
              method: 'GET',
              path: apiPath
            });

            expect(response.produced).to.equal(true);

            return retry(() => {
              return agentControls.getSpans().then(spans => {
                expect(spans.length).to.equal(4);

                const httpEntry = verifyHttpRootEntry({
                  spans,
                  apiPath: '/produce',
                  pid: String(producerControls.getPid())
                });

                const producerExit = verifyExitSpan({
                  spanName: 'otel',
                  spans,
                  parent: httpEntry,
                  withError: false,
                  pid: String(producerControls.getPid()),
                  dataProperty: 'tags',
                  extraTests: span => {
                    expect(span.t).to.equal(httpEntry.t);
                    expect(span.data.tags.name).to.eql('confluent-kafka-topic');
                    expect(span.data.tags['messaging.system']).to.equal('kafka');
                    expect(span.data.tags['messaging.operation.name']).to.equal('produce');
                    checkTelemetryResourceAttrs(span);
                  }
                });

                const consumerEntry = verifyEntrySpan({
                  spanName: 'otel',
                  spans,
                  withError: false,
                  pid: String(consumerControls.getPid()),
                  dataProperty: 'tags',
                  extraTests: span => {
                    expect(span.t).to.equal(httpEntry.t);
                    expect(span.p).to.equal(producerExit.s);
                    expect(span.data.tags.name).to.eql('confluent-kafka-topic');
                    expect(span.data.tags['messaging.system']).to.equal('kafka');
                    expect(span.data.tags['messaging.operation.type']).to.equal('receive');
                    checkTelemetryResourceAttrs(span);
                  }
                });

                verifyHttpExit(spans, consumerEntry);
              });
            });
          });

          it('[suppressed] must not trace', async () => {
            const response = await producerControls.sendRequest({
              method: 'GET',
              path: apiPath,
              suppressTracing: true
            });

            expect(response.produced).to.equal(true);

            await delay(1000 * 5);

            return retry(async () => {
              const spans = await agentControls.getSpans();
              expect(spans).to.have.lengthOf(0);
            });
          });
        });
      });

      // TODO: Restify test is broken in v24. See Issue: https://github.com/restify/node-restify/issues/1984
      let restifyTest = semver.gte(process.versions.node, '24.0.0') ? describe.skip : describe;

      if (process.env.RUN_ESM === 'true') {
        restifyTest = describe.skip;
      }

      restifyTest('restify', function () {
        describe('opentelemetry is enabled', function () {
          globalAgent.setUpCleanUpHooks();

          let controls;

          before(async () => {
            controls = new ProcessControls({
              appPath: path.join(__dirname, './restify-app'),
              useGlobalAgent: true,
              cwd: __dirname,
              enableOtelIntegration: true,
              env: { OTEL_API_VERSION: version }
            });

            await controls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await controls.stop();
          });

          it('should trace', () =>
            controls
              .sendRequest({
                method: 'GET',
                path: '/test'
              })
              .then(() =>
                retry(() =>
                  agentControls.getSpans().then(spans => {
                    expect(spans.length).to.equal(8);

                    const httpEntry = verifyHttpRootEntry({
                      spans,
                      apiPath: '/test',
                      pid: String(controls.getPid())
                    });

                    verifyExitSpan({
                      spanName: 'otel',
                      spans,
                      parent: httpEntry,
                      withError: false,
                      pid: String(controls.getPid()),
                      dataProperty: 'tags',
                      extraTests: span => {
                        expect(span.data.tags.name).to.eql('request handler - /test');
                        expect(span.data.operation).to.equal('restify');
                        expect(span.data.tags['restify.version']).to.eql('11.1.0');
                        expect(span.data.tags['restify.type']).to.eql('request_handler');
                        expect(span.data.tags['restify.method']).to.eql('get');
                        expect(span.data.tags['http.route']).to.eql('/test');

                        checkTelemetryResourceAttrs(span);
                      }
                    });

                    verifyIntermediateSpan({
                      spanName: 'otel',
                      spans,
                      parent: httpEntry,
                      withError: false,
                      pid: String(controls.getPid()),
                      dataProperty: 'tags',
                      testMethod: expectExactlyNMatching,
                      n: 4
                    });

                    ['parseAccept', 'parseQueryString', 'readBody', 'parseBody'].forEach(name => {
                      verifyIntermediateSpan({
                        spanName: 'otel',
                        spans,
                        parent: httpEntry,
                        withError: false,
                        pid: String(controls.getPid()),
                        dataProperty: 'tags',
                        extraTests: span => {
                          expect(span.data.tags.name).to.eql(`middleware - ${name}`);
                          expect(span.data.tags['restify.name']).to.eql(name);
                          expect(span.data.tags['restify.version']).to.eql('11.1.0');
                          expect(span.data.tags['restify.type']).to.eql('middleware');
                          expect(span.data.tags['restify.method']).to.eql('use');
                          expect(span.data.tags['http.route']).to.eql('/test');

                          checkTelemetryResourceAttrs(span);
                        }
                      });
                    });

                    verifyExitSpan({
                      spanName: 'otel',
                      spans,
                      parent: httpEntry,
                      withError: false,
                      pid: String(controls.getPid()),
                      dataProperty: 'tags',
                      extraTests: span => {
                        expect(span.data.tags.name).to.eql('request handler - /test');
                        expect(span.data.tags['restify.name']).to.not.exist;
                        expect(span.data.tags['restify.version']).to.eql('11.1.0');
                        expect(span.data.tags['restify.type']).to.eql('request_handler');
                        expect(span.data.tags['restify.method']).to.eql('get');
                        expect(span.data.tags['http.route']).to.eql('/test');

                        checkTelemetryResourceAttrs(span);
                      }
                    });

                    verifyExitSpan({
                      spanName: 'postgres',
                      spans,
                      parent: httpEntry,
                      withError: false,
                      pid: String(controls.getPid()),
                      dataProperty: 'pg'
                    });

                    verifyHttpExit(spans, httpEntry);
                  })
                )
              ));

          it('[suppressed] should not trace', async () => {
            return controls
              .sendRequest({
                method: 'GET',
                path: '/test',
                suppressTracing: true
              })
              .then(() => delay(DELAY_TIMEOUT_IN_MS))
              .then(() => {
                return retry(async () => {
                  const spans = await agentControls.getSpans();
                  expect(spans).to.be.empty;
                });
              });
          });
        });

        describe('opentelemetry is disabled', function () {
          let controls;

          before(async () => {
            controls = new ProcessControls({
              appPath: path.join(__dirname, './restify-app'),
              useGlobalAgent: true,
              cwd: __dirname,
              enableOtelIntegration: false,
              env: {
                OTEL_API_VERSION: version
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

          it('should trace instana spans only', () =>
            controls
              .sendRequest({
                method: 'GET',
                path: '/test'
              })
              .then(() =>
                retry(() =>
                  agentControls.getSpans().then(spans => {
                    expect(spans.length).to.equal(3);

                    const httpEntry = verifyHttpRootEntry({
                      spans,
                      apiPath: '/test',
                      pid: String(controls.getPid())
                    });

                    verifyExitSpan({
                      spanName: 'postgres',
                      spans,
                      parent: httpEntry,
                      withError: false,
                      pid: String(controls.getPid()),
                      dataProperty: 'pg'
                    });

                    verifyHttpExit(spans, httpEntry);
                  })
                )
              ));
        });
      });

      let runFs = describe;
      if (process.env.RUN_ESM === 'true') {
        runFs = describe.skip;
      }

      runFs('fs', function () {
        globalAgent.setUpCleanUpHooks();

        let controls;

        before(async () => {
          controls = new ProcessControls({
            appPath: path.join(__dirname, './fs-app'),
            useGlobalAgent: true,
            cwd: __dirname,
            enableOtelIntegration: true,
            env: { OTEL_API_VERSION: version }
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

        it('should trace when there is no otel parent', () =>
          controls
            .sendRequest({
              method: 'GET',
              path: '/fsread'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(2);

                  const httpEntry = verifyHttpRootEntry({
                    spans,
                    apiPath: '/fsread',
                    pid: String(controls.getPid())
                  });

                  verifyExitSpan({
                    spanName: 'otel',
                    spans,
                    parent: httpEntry,
                    withError: false,
                    pid: String(controls.getPid()),
                    dataProperty: 'tags',
                    extraTests: span => {
                      expect(span.data.tags.name).to.eql('fs readFileSync');
                      expect(span.data.operation).to.eql('fs');
                      checkTelemetryResourceAttrs(span);
                    }
                  });
                })
              )
            ));

        it('should trace when there is an otel parent', () =>
          controls
            .sendRequest({
              method: 'GET',
              path: '/fsread2'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(3);

                  const httpEntry = verifyHttpRootEntry({
                    spans,
                    apiPath: '/fsread2',
                    pid: String(controls.getPid())
                  });

                  verifyExitSpan({
                    spanName: 'otel',
                    spans,
                    parent: httpEntry,
                    withError: false,
                    pid: String(controls.getPid()),
                    dataProperty: 'tags',
                    extraTests: span => {
                      expect(span.data.tags.name).to.eql('fs statSync');
                      checkTelemetryResourceAttrs(span);
                    }
                  });

                  verifyExitSpan({
                    spanName: 'otel',
                    spans,
                    parent: httpEntry,
                    withError: false,
                    pid: String(controls.getPid()),
                    dataProperty: 'tags',
                    extraTests: span => {
                      expect(span.data.tags.name).to.eql('fs readFileSync');
                      checkTelemetryResourceAttrs(span);
                    }
                  });
                })
              )
            ));

        it('[suppressed] should not trace', () =>
          controls
            .sendRequest({
              method: 'GET',
              path: '/fsread',
              suppressTracing: true
            })
            .then(() => delay(DELAY_TIMEOUT_IN_MS))
            .then(() => retry(() => agentControls.getSpans().then(spans => expect(spans).to.be.empty))));
      });

      let runSocketIo = describe;
      if (process.env.RUN_ESM === 'true') {
        runSocketIo = describe.skip;
      }

      runSocketIo('socket.io', function () {
        let socketIOServerPort;

        let serverControls;
        let clientControls;

        before(async () => {
          socketIOServerPort = portfinder();

          serverControls = new ProcessControls({
            appPath: path.join(__dirname, './socketio-server'),
            useGlobalAgent: true,
            cwd: __dirname,
            enableOtelIntegration: true,
            env: {
              SOCKETIOSERVER_PORT: socketIOServerPort,
              OTEL_API_VERSION: version
            }
          });

          clientControls = new ProcessControls({
            appPath: path.join(__dirname, './socketio-client'),
            useGlobalAgent: true,
            cwd: __dirname,
            enableOtelIntegration: true,
            env: {
              SOCKETIOSERVER_PORT: socketIOServerPort,
              OTEL_API_VERSION: version
            }
          });

          await clientControls.startAndWaitForAgentConnection();
          await serverControls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await serverControls.stop();
          await clientControls.stop();
        });

        it('should trace', () =>
          serverControls
            .sendRequest({
              method: 'GET',
              path: '/io-emit'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(3);

                  const httpEntry = verifyHttpRootEntry({
                    spans,
                    apiPath: '/io-emit',
                    pid: String(serverControls.getPid())
                  });

                  verifyEntrySpan({
                    spanName: 'otel',
                    spans,
                    withError: false,
                    pid: String(serverControls.getPid()),
                    dataProperty: 'tags',
                    extraTests: span => {
                      expect(span.data.operation).to.equal('socket.io');
                      expect(span.data.tags.name).to.contain('receive');
                      expect(span.data.tags['messaging.system']).to.eql('socket.io');
                      expect(span.data.tags['messaging.destination']).to.eql('ON test_reply');
                      expect(span.data.tags['messaging.operation']).to.eql('receive');
                      expect(span.data.tags['messaging.socket.io.event_name']).to.eql('test_reply');

                      checkTelemetryResourceAttrs(span);
                    }
                  });

                  verifyExitSpan({
                    spanName: 'otel',
                    spans,
                    parent: httpEntry,
                    withError: false,
                    pid: String(serverControls.getPid()),
                    dataProperty: 'tags',
                    extraTests: span => {
                      expect(span.data.tags.name).to.contain('send');
                      expect(span.data.tags['messaging.system']).to.eql('socket.io');
                      expect(span.data.tags['messaging.destination_kind']).to.eql('topic');
                      expect(span.data.tags['messaging.socket.io.event_name']).to.eql('test');
                      expect(span.data.tags['messaging.socket.io.namespace']).to.eql('/');
                      expect(span.data.tags['messaging.destination']).to.eql('EMIT test');

                      checkTelemetryResourceAttrs(span);
                    }
                  });
                })
              )
            ));

        it('should trace', () =>
          serverControls
            .sendRequest({
              method: 'GET',
              path: '/io-send'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(2);

                  const httpEntry = verifyHttpRootEntry({
                    spans,
                    apiPath: '/io-send',
                    pid: String(serverControls.getPid())
                  });

                  verifyExitSpan({
                    spanName: 'otel',
                    spans,
                    parent: httpEntry,
                    withError: false,
                    pid: String(serverControls.getPid()),
                    dataProperty: 'tags',
                    extraTests: span => {
                      expect(span.data.tags.name).to.contain('send');
                      expect(span.data.tags['messaging.system']).to.eql('socket.io');
                      expect(span.data.tags['messaging.destination_kind']).to.eql('topic');
                      expect(span.data.tags['messaging.socket.io.event_name']).to.eql('message');
                      expect(span.data.tags['messaging.socket.io.namespace']).to.eql('/');
                      expect(span.data.tags['messaging.destination']).to.eql('EMIT message');

                      checkTelemetryResourceAttrs(span);
                    }
                  });
                })
              )
            ));

        it('[suppressed] should not trace', () =>
          serverControls
            .sendRequest({
              method: 'GET',
              path: '/io-emit',
              suppressTracing: true
            })
            .then(() => delay(DELAY_TIMEOUT_IN_MS))
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  // We cannot forward the headers because socket.io does not support headers
                  expect(spans.length).to.eql(1);
                })
              )
            ));
      });

      describe('tedious', function () {
        describe('opentelemetry is enabled', function () {
          let controls;

          // We need to increase the waiting timeout here for the initial azure connection,
          // because it can take up to 1-2 minutes till azure replies if the db is in paused state
          this.timeout(1000 * 60 * 2);

          before(async () => {
            if (process.env.INSTANA_TEST_SKIP_INSTALLING_DEPS !== 'true') {
              const rootPackageJson = require('../../../../../package.json');
              const tediousVersion = rootPackageJson.devDependencies.tedious;
              execSync(`npm i "tedious@${tediousVersion}" --prefix ./ --save`, {
                cwd: __dirname,
                stdio: 'inherit'
              });
            }

            controls = new ProcessControls({
              appPath: path.join(__dirname, './tedious-app'),
              useGlobalAgent: true,
              cwd: __dirname,
              esmLoaderPath: path.join(__dirname, 'node_modules', '@instana', 'collector', 'esm-register.mjs'),
              enableOtelIntegration: true,
              env: {
                OTEL_API_VERSION: version
              }
            });

            await controls.startAndWaitForAgentConnection(5000, Date.now() + 1000 * 60 * 2);
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await controls.stop();
          });

          const sendRequestAndVerifySpans = (method, endpoint, expectedStatement) =>
            controls
              .sendRequest({
                method,
                path: endpoint
              })
              .then(() => delay(DELAY_TIMEOUT_IN_MS))
              .then(() =>
                retry(() =>
                  agentControls.getSpans().then(spans => {
                    expect(spans.length).to.equal(2);

                    const httpEntry = verifyHttpRootEntry({
                      spans,
                      apiPath: endpoint,
                      pid: String(controls.getPid())
                    });

                    verifyExitSpan({
                      spanName: 'otel',
                      spans,
                      parent: httpEntry,
                      withError: false,
                      pid: String(controls.getPid()),
                      dataProperty: 'tags',
                      extraTests: span => {
                        const queryType = endpoint === '/packages/batch' ? 'execSqlBatch' : 'execSql';
                        expect(span.data.tags.name).to.eql(`${queryType} azure-nodejs-test`);

                        expect(span.data.operation).to.equal('tedious');
                        expect(span.data.tags['db.system']).to.eql('mssql');
                        expect(span.data.tags['db.name']).to.eql('azure-nodejs-test');
                        expect(span.data.tags['db.user']).to.eql('admin@instana@nodejs-team-db-server');
                        expect(span.data.tags['db.statement']).to.eql(expectedStatement);
                        expect(span.data.tags['net.peer.name']).to.eql('nodejs-team-db-server.database.windows.net');
                        checkTelemetryResourceAttrs(span);
                      }
                    });
                  })
                )
              );
          it('should trace select queries', () =>
            sendRequestAndVerifySpans('GET', '/packages', 'SELECT * FROM packages'));
          it('should trace batch queries', function (done) {
            sendRequestAndVerifySpans(
              'POST',
              '/packages/batch',
              "\n  INSERT INTO packages (id, name, version) VALUES (11, 'BatchPackage1', 1);\n  " +
                "INSERT INTO packages (id, name, version) VALUES (11, 'BatchPackage2', 2);\n"
            )
              .then(() => {
                done();
              })
              .catch(err => done(err));
          });
          it('should trace delete queries', () =>
            sendRequestAndVerifySpans('DELETE', '/packages', 'DELETE FROM packages WHERE id = 11'));

          it('[suppressed] should not trace', () =>
            controls
              .sendRequest({
                method: 'GET',
                path: '/packages',
                suppressTracing: true
              })
              .then(() => delay(DELAY_TIMEOUT_IN_MS))
              .then(() => retry(() => agentControls.getSpans().then(spans => expect(spans).to.be.empty))));
        });

        describe('opentelemetry is disabled', function () {
          let controls;

          before(async () => {
            controls = new ProcessControls({
              appPath: path.join(__dirname, './tedious-app'),
              useGlobalAgent: true,
              enableOtelIntegration: false,
              env: {
                OTEL_API_VERSION: version
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
          it('should not trace', () => {
            controls
              .sendRequest({
                method: 'GET',
                path: '/packages'
              })
              .then(() => delay(DELAY_TIMEOUT_IN_MS))
              .then(() =>
                retry(() => {
                  return agentControls.getSpans().then(spans => {
                    expect(spans).to.be.empty;
                  });
                })
              );
          });
        });
      });

      let runOracleDb = describe;
      if (process.env.RUN_ESM === 'true') {
        runOracleDb = describe.skip;
      }

      runOracleDb('OracleDB', function () {
        this.timeout(1000 * 60 * 2);

        describe('opentelemetry is enabled', function () {
          let controls;

          before(async () => {
            controls = new ProcessControls({
              appPath: path.join(__dirname, './oracle-app'),
              useGlobalAgent: true,
              cwd: __dirname,
              enableOtelIntegration: true,
              env: { OTEL_API_VERSION: version }
            });

            await controls.startAndWaitForAgentConnection(5000, Date.now() + 1000 * 60 * 2);
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await controls.stop();
          });

          it('should trace', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/trace'
            });

            await retry(async () => {
              const spans = await agentControls.getSpans();
              expect(spans.length).to.equal(2);

              const httpEntry = verifyHttpRootEntry({
                spans,
                apiPath: '/trace',
                pid: String(controls.getPid())
              });

              verifyExitSpan({
                spanName: 'otel',
                spans,
                parent: httpEntry,
                withError: false,
                pid: String(controls.getPid()),
                dataProperty: 'tags',
                extraTests: span => {
                  expect(span.data.operation).to.equal('oracle');
                  expect(span.data.tags.name).to.eql('oracledb.Connection.execute');
                  expect(span.data.tags['db.system.name']).to.eql('oracle.db');
                  expect(span.data.tags['server.address']).to.eql('localhost');
                  checkTelemetryResourceAttrs(span);
                }
              });
            });
          });

          it('[suppressed] should not trace', async () => {
            return controls
              .sendRequest({
                method: 'GET',
                path: '/trace',
                suppressTracing: true
              })
              .then(() => delay(DELAY_TIMEOUT_IN_MS))
              .then(() => {
                return retry(async () => {
                  const spans = await agentControls.getSpans();
                  expect(spans).to.be.empty;
                });
              });
          });
        });

        describe('opentelemetry is disabled', function () {
          let controls;

          before(async () => {
            controls = new ProcessControls({
              appPath: path.join(__dirname, './oracle-app'),
              useGlobalAgent: true,
              cwd: __dirname,
              enableOtelIntegration: false,
              env: {
                OTEL_API_VERSION: version
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

          it('should trace instana spans only', () =>
            controls
              .sendRequest({
                method: 'GET',
                path: '/trace'
              })
              .then(() =>
                retry(() =>
                  agentControls.getSpans().then(spans => {
                    expect(spans.length).to.equal(1);

                    verifyHttpRootEntry({
                      spans,
                      apiPath: '/trace',
                      pid: String(controls.getPid())
                    });
                  })
                )
              ));
        });
      });
    });
  });

  let runOtelSdkAndInstana = mochaSuiteFn;
  if (process.env.RUN_ESM === 'true') {
    runOtelSdkAndInstana = describe.skip;
  }

  runOtelSdkAndInstana('when otel sdk and instana is enabled', function () {
    this.timeout(config.getTestTimeout() * 4);
    before(async () => {
      if (process.env.INSTANA_TEST_SKIP_INSTALLING_DEPS === 'true') {
        return;
      }

      execSync('rm -rf ./otel-sdk-and-instana/node_modules', { cwd: __dirname, stdio: 'inherit' });
      execSync('npm install --no-save --no-package-lock', {
        cwd: path.join(__dirname, './otel-sdk-and-instana'),
        stdio: 'inherit'
      });
    });

    describe('when openTelemetry initialized first', function () {
      let controls;
      before(async () => {
        controls = new ProcessControls({
          appPath: path.join(__dirname, './otel-sdk-and-instana/app'),
          useGlobalAgent: true,
          cwd: path.join(__dirname, './otel-sdk-and-instana'),
          enableOtelIntegration: true,
          env: {
            COLLECTOR_FIRST: 'false'
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

      it('should trace with both Instana and OpenTelemetry SDK', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/otel-sdk-fs'
          })
          .then(response => {
            // Verify otel spans in the response
            expect(response.success).to.be.true;
            expect(response.otelspan).to.be.an('object');
            expect(response.otelspan.name).to.eql('explicit-otel-operation');
            expect(response.otelspan._spanContext).to.have.property('traceId');
            expect(response.otelspan._spanContext).to.have.property('spanId');
            expect(response.otelspan.instrumentationLibrary).to.be.an('object');
            expect(response.otelspan.instrumentationLibrary.name).to.eql('otel-sdk-app-tracer');

            return retry(() =>
              agentControls.getSpans().then(spans => {
                expect(spans.length).to.equal(3);

                const httpEntry = verifyHttpRootEntry({
                  spans,
                  apiPath: '/otel-sdk-fs',
                  pid: String(controls.getPid())
                });

                verifyExitSpan({
                  spanName: 'otel',
                  spans,
                  parent: httpEntry,
                  withError: false,
                  pid: String(controls.getPid()),
                  dataProperty: 'tags',
                  extraTests: span => {
                    expect(span.data.tags.name).to.eql('fs readFileSync');

                    // This test uses a global OpenTelemetry SDK instance, which still uses sdk version v1.
                    // Its nice to keep it like that to proof that v1 and v2 work fine with our integration.
                    checkTelemetryResourceAttrs(span, /1\.\d+\.\d/);
                  }
                });

                verifyExitSpan({
                  spanName: 'otel',
                  spans,
                  parent: httpEntry,
                  withError: false,
                  pid: String(controls.getPid()),
                  dataProperty: 'tags',
                  extraTests: span => {
                    expect(span.data.tags.name).to.eql('fs statSync');
                    checkTelemetryResourceAttrs(span, /1\.\d+\.\d/);
                  }
                });
              })
            );
          }));

      it('[suppressed] should not trace', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/otel-sdk-fs',
            suppressTracing: true
          })
          .then(() => delay(DELAY_TIMEOUT_IN_MS))
          .then(() => retry(() => agentControls.getSpans().then(spans => expect(spans).to.be.empty))));
    });

    describe('when Collector initialized first', function () {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          appPath: path.join(__dirname, './otel-sdk-and-instana/app'),
          useGlobalAgent: true,
          cwd: path.join(__dirname, './otel-sdk-and-instana'),
          enableOtelIntegration: true,
          env: {
            COLLECTOR_FIRST: 'true'
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

      // TODO: There’s a current limitation with the OpenTelemetry integration.
      // When Instana is initialized first, our tracing doesn’t function correctly.
      // OpenTelemetry tracing continues to work, but our tracing does not.
      // This issue needs to be resolved in a future update.
      it('should trace with OpenTelemetry SDK spans and should not trace Instana spans', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/otel-sdk-fs'
          })
          .then(response => {
            // Verify otel spans in the response
            expect(response.success).to.be.true;
            expect(response.otelspan).to.be.an('object');
            expect(response.otelspan.name).to.eql('explicit-otel-operation');
            expect(response.otelspan._spanContext).to.have.property('traceId');
            expect(response.otelspan._spanContext).to.have.property('spanId');
            expect(response.otelspan.instrumentationScope).to.be.an('object');
            expect(response.otelspan.instrumentationScope.name).to.eql('otel-sdk-app-tracer');
          })
          .then(() => delay(DELAY_TIMEOUT_IN_MS))
          .then(() =>
            retry(() =>
              agentControls.getSpans().then(spans => {
                // our tracing should not capture spans
                expect(spans).to.be.empty;
              })
            )
          ));

      it('[suppressed] should not trace', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/otel-sdk-fs',
            suppressTracing: true
          })
          .then(() => delay(DELAY_TIMEOUT_IN_MS))
          .then(() => retry(() => agentControls.getSpans().then(spans => expect(spans).to.be.empty))));
    });
  });
});

function checkTelemetryResourceAttrs(span, otelSdkVersion = /2\.\d+\.\d/) {
  expect(span.data.resource['service.name']).to.not.exist;
  expect(span.data.resource['telemetry.sdk.language']).to.eql('nodejs');
  expect(span.data.resource['telemetry.sdk.name']).to.eql('opentelemetry');
  expect(span.data.resource['telemetry.sdk.version']).to.match(otelSdkVersion);
}

function verifyHttpExit(spans, parentSpan) {
  return expectExactlyOneMatching(spans, [
    span => expect(span.n).to.equal('node.http.client'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.async).to.not.exist,
    span => expect(span.error).to.not.exist,
    span => expect(span.ec).to.equal(0),
    span => expect(span.t).to.be.a('string'),
    span => expect(span.s).to.be.a('string'),
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.data.http.method).to.equal('GET'),
    span => expect(span.data.http.status).to.equal(200),
    span => expect(span.fp).to.not.exist
  ]);
}
