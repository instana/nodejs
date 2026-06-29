/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const os = require('node:os');
const proxyquire = require('proxyquire');

const mockPackageJson = { version: '6.0.0' };

const resourceTransformer = proxyquire('../../../src/otlpExporter/common/transformers/resource', {
  '../../../../package.json': mockPackageJson
});
const { convert } = proxyquire('../../../src/otlpExporter/traces/converter', {
  './transformers': {
    ...require('../../../src/otlpExporter/traces/transformers'),
    resource: resourceTransformer
  }
});

const otlp = require('../../../src/otlpExporter');
const { extractSpanMetadata } = require('../../../src/otlpExporter/traces/transformers/spanMetaData');
const { extractSpanAttributes } = require('../../../src/otlpExporter/traces/transformers/spanAttributes');
const mappers = require('../../../src/otlpExporter/traces/mappers');

function createSpan(overrides = {}) {
  return {
    t: 'trace-1',
    s: 'span-1',
    ts: 1710000000000,
    d: 25,
    n: 'custom.span',
    k: 1,
    ...overrides,
    f: {
      e: '321',
      h: 'host-id-1',
      ...(overrides.f || {})
    },
    data: {
      ...(overrides.data || {})
    }
  };
}

function createHttpSpan(overrides = {}) {
  const http = {
    operation: 'get',
    path: '/users/42',
    path_tpl: '/users/:id',
    route: '/users/:id',
    endpoints: 'https://example.test/users/42',
    params: 'active=true',
    status: 200,
    connection: 'api.example.test:443',
    ...(overrides.data?.http || {})
  };

  return createSpan({
    n: 'node.http.server',
    k: 1,
    ...overrides,
    data: {
      http,
      ...(overrides.data || {})
    }
  });
}

function createPgSpan(overrides = {}) {
  const pg = {
    stmt: 'SELECT * FROM users WHERE id = $1',
    host: 'db.example.test',
    port: 5432,
    db: 'users',
    user: 'instana',
    ...(overrides.data?.pg || {})
  };

  return createSpan({
    n: 'postgres',
    k: 2,
    ...overrides,
    data: {
      pg,
      ...(overrides.data || {})
    }
  });
}

function createKafkaSpan(overrides = {}) {
  const kafka = {
    operation: 'send',
    endpoints: 'orders',
    error: undefined,
    ...(overrides.data?.kafka || {})
  };

  return createSpan({
    n: 'kafka',
    k: 2,
    ...overrides,
    data: {
      kafka,
      ...(overrides.data || {})
    }
  });
}

function createInternalSpan(overrides = {}) {
  return createSpan({
    n: 'custom.internal',
    k: 3,
    ...overrides
  });
}

function createAzureBlobSpan(overrides = {}) {
  const azstorage = {
    op: 'put',
    accountName: 'storage-account',
    containerName: 'uploads',
    blobName: 'invoice.pdf',
    ...(overrides.data?.azstorage || {})
  };

  return createSpan({
    n: 'azure.blob',
    k: 2,
    ...overrides,
    data: {
      azstorage,
      ...(overrides.data || {})
    }
  });
}

function createAwsLambdaInvokeSpan(overrides = {}) {
  const lambdaInvoke = {
    function: 'my-function',
    type: 'RequestResponse',
    ...(overrides.data?.['aws.lambda.invoke'] || {})
  };

  return createSpan({
    n: 'aws.lambda.invoke',
    k: 2,
    ...overrides,
    data: {
      'aws.lambda.invoke': lambdaInvoke,
      ...(overrides.data || {})
    }
  });
}

function createAwsLambdaEntrySpan(overrides = {}) {
  const lambda = {
    arn: 'arn:aws:lambda:us-east-1:123456789012:function:my-function:42',
    functionName: 'my-function',
    functionVersion: '$LATEST',
    runtime: 'nodejs',
    reqId: 'abc-123-req-id',
    coldStart: true,
    trigger: 'aws:api.gateway',
    ...(overrides.data?.lambda || {})
  };

  return createSpan({
    n: 'aws.lambda.entry',
    k: 1,
    ...overrides,
    data: {
      lambda,
      ...(overrides.data || {})
    }
  });
}

function createOtelSpan(overrides = {}) {
  return createSpan({
    n: 'otel',
    k: 2,
    data: {
      operation: 'publish',
      tags: {
        'http.method': 'POST',
        'messaging.system': 'custom-bus',
        success: true
      },
      ...(overrides.data || {})
    },
    ...overrides
  });
}

function getConvertedSpans(result) {
  return result.resourceSpans[0].scopeSpans[0].spans;
}

function getResourceAttributes(result) {
  return result.resourceSpans[0].resource.attributes;
}

function findAttribute(attributes, key) {
  return attributes.find(attribute => attribute.key === key);
}

function expectAttribute(attributes, key, expectedValue) {
  expect(findAttribute(attributes, key), `Missing attribute ${key}`).to.deep.equal({
    key,
    value: expectedValue
  });
}

describe('tracing/converters/otlp', () => {
  let hostnameStub;

  before(() => {
    otlp.init({
      serviceName: 'otel-exporter-test',
      logger: console
    });

    hostnameStub = sinon.stub(os, 'hostname').returns('test.local.server');
  });

  after(() => {
    hostnameStub.restore();
  });

  describe('converter', () => {
    it('converts a representative batch of spans with focused assertions', () => {
      const spans = [
        createHttpSpan(),
        createPgSpan({
          t: 'trace-1',
          s: 'span-2',
          p: 'span-1',
          ts: 1710000000100,
          d: 40
        }),
        createKafkaSpan({
          t: 'trace-1',
          s: 'span-3',
          p: 'span-2',
          ts: 1710000000200,
          d: 15
        }),
        createInternalSpan({
          t: 'trace-1',
          s: 'span-4',
          p: 'span-3',
          ts: 1710000000300,
          d: 5
        }),
        createAzureBlobSpan({
          t: 'trace-1',
          s: 'span-5',
          p: 'span-4',
          ts: 1710000000400,
          d: 12
        }),
        createOtelSpan({
          t: 'trace-1',
          s: 'span-6',
          p: 'span-5',
          ts: 1710000000500,
          d: 8
        })
      ];

      const result = convert(spans);

      expect(result.resourceSpans).to.have.lengthOf(1);
      expect(result.resourceSpans[0].scopeSpans).to.have.lengthOf(1);
      expect(result.resourceSpans[0].scopeSpans[0].scope).to.deep.equal({
        name: '@instana/collector',
        version: '6.0.0'
      });

      const resourceAttributes = getResourceAttributes(result);
      expectAttribute(resourceAttributes, 'service.name', { stringValue: 'otel-exporter-test' });
      expectAttribute(resourceAttributes, 'telemetry.sdk.language', { stringValue: 'nodejs' });
      expectAttribute(resourceAttributes, 'telemetry.sdk.name', { stringValue: 'instana' });
      expectAttribute(resourceAttributes, 'telemetry.sdk.version', { stringValue: '6.0.0' });
      expectAttribute(resourceAttributes, 'process.pid', { intValue: 321 });
      expectAttribute(resourceAttributes, 'host.name', { stringValue: 'test.local.server' });
      expectAttribute(resourceAttributes, 'host.id', { stringValue: 'host-id-1' });

      const convertedSpans = getConvertedSpans(result);
      expect(convertedSpans).to.have.lengthOf(6);

      const httpSpan = convertedSpans[0];
      expect(httpSpan.name).to.equal('GET /users/:id');
      expect(httpSpan.kind).to.equal(2);
      expect(httpSpan.traceId).to.equal('0000000000000000000000000trace-1');
      expect(httpSpan.spanId).to.equal('0000000000span-1');
      expect(httpSpan.startTimeUnixNano).to.equal('1710000000000000000');
      expect(httpSpan.endTimeUnixNano).to.equal('1710000000025000000');
      expect(httpSpan.status).to.deep.equal({ code: 0 });
      expectAttribute(httpSpan.attributes, 'http.method', { stringValue: 'GET' });
      expectAttribute(httpSpan.attributes, 'http.url', { stringValue: 'https://example.test/users/42' });
      expectAttribute(httpSpan.attributes, 'http.target', { stringValue: '/users/42' });
      expectAttribute(httpSpan.attributes, 'http.route', { stringValue: '/users/:id' });
      expectAttribute(httpSpan.attributes, 'server.address', { stringValue: 'api.example.test' });
      expectAttribute(httpSpan.attributes, 'server.port', { intValue: 443 });

      const pgSpan = convertedSpans[1];
      expect(pgSpan.name).to.equal('SELECT');
      expect(pgSpan.kind).to.equal(3);
      expect(pgSpan.parentSpanId).to.equal('0000000000span-1');
      expectAttribute(pgSpan.attributes, 'db.system', { stringValue: 'postgresql' });
      expectAttribute(pgSpan.attributes, 'db.statement', { stringValue: 'SELECT * FROM users WHERE id = $1' });
      expectAttribute(pgSpan.attributes, 'db.user', { stringValue: 'instana' });
      expectAttribute(pgSpan.attributes, 'db.name', { stringValue: 'users' });

      const kafkaSpan = convertedSpans[2];
      expect(kafkaSpan.name).to.equal('send orders');
      expect(kafkaSpan.kind).to.equal(3);
      expectAttribute(kafkaSpan.attributes, 'messaging.system', { stringValue: 'kafka' });
      expectAttribute(kafkaSpan.attributes, 'messaging.destination', { stringValue: 'orders' });
      expectAttribute(kafkaSpan.attributes, 'messaging.operation', { stringValue: 'send' });

      const internalSpan = convertedSpans[3];
      expect(internalSpan.name).to.equal('custom.internal');
      expect(internalSpan.kind).to.equal(1);
      expect(internalSpan.attributes).to.deep.equal([]);

      const azureBlobSpan = convertedSpans[4];
      expect(azureBlobSpan.name).to.equal('azure.storage.put');
      expect(azureBlobSpan.kind).to.equal(3);
      expectAttribute(azureBlobSpan.attributes, 'cloud.provider', { stringValue: 'azure' });
      expectAttribute(azureBlobSpan.attributes, 'db.operation.name', { stringValue: 'put' });
      expect(azureBlobSpan.attributes.some(attribute => attribute.value.stringValue === 'storage-account')).to.be.true;
      expect(azureBlobSpan.attributes.some(attribute => attribute.value.stringValue === 'uploads')).to.be.true;
      expect(azureBlobSpan.attributes.some(attribute => attribute.value.stringValue === 'invoice.pdf')).to.be.true;

      const otelSpan = convertedSpans[5];
      expect(otelSpan.name).to.equal('otel');
      expect(otelSpan.kind).to.equal(3);
      expectAttribute(otelSpan.attributes, 'operation', { stringValue: 'publish' });
      expectAttribute(otelSpan.attributes, 'http.method', { stringValue: 'POST' });
      expectAttribute(otelSpan.attributes, 'messaging.system', { stringValue: 'custom-bus' });
      expectAttribute(otelSpan.attributes, 'success', { boolValue: true });
    });

    it('returns empty resourceSpans for empty input', () => {
      expect(convert([])).to.deep.equal({ resourceSpans: [] });
    });

    it('skips invalid, null and log spans while keeping valid spans', () => {
      const validSpan = createHttpSpan();
      const invalidSpan = null;
      const logSpan = {
        t: 'trace-2',
        s: 'log-1',
        n: 'log.console',
        data: { log: { message: 'test' } }
      };

      const result = convert([null, invalidSpan, logSpan, validSpan, null]);

      expect(result.resourceSpans).to.have.lengthOf(1);
      expect(getConvertedSpans(result)).to.have.lengthOf(1);
      expect(getConvertedSpans(result)[0].name).to.equal('GET /users/:id');
    });
  });

  describe('transformers', () => {
    describe('spanMetaData', () => {
      it('extracts metadata for server, client, internal and error spans', () => {
        const httpSpan = createHttpSpan();
        const kafkaSpan = createKafkaSpan({
          ec: 1,
          data: {
            kafka: {
              operation: 'send',
              endpoints: 'orders',
              error: 'broker unavailable'
            }
          }
        });
        const internalSpan = createInternalSpan();
        const otelSpan = createOtelSpan({
          ec: 1,
          data: {
            operation: 'publish',
            tags: {
              error: 'otel failed'
            }
          }
        });

        expect(extractSpanMetadata(httpSpan, mappers.get(httpSpan))).to.include({
          traceId: '0000000000000000000000000trace-1',
          spanId: '0000000000span-1',
          kind: 2,
          name: 'GET /users/:id'
        });
        expect(extractSpanMetadata(httpSpan, mappers.get(httpSpan)).status).to.deep.equal({ code: 0 });

        expect(extractSpanMetadata(kafkaSpan, mappers.get(kafkaSpan))).to.include({
          kind: 3,
          name: 'send orders'
        });
        expect(extractSpanMetadata(kafkaSpan, mappers.get(kafkaSpan)).status).to.deep.equal({
          code: 2,
          message: 'broker unavailable'
        });

        expect(extractSpanMetadata(internalSpan, mappers.get(internalSpan))).to.include({
          kind: 1,
          name: 'custom.internal'
        });

        expect(extractSpanMetadata(otelSpan, mappers.get(otelSpan)).status).to.deep.equal({
          code: 2,
          message: 'otel failed'
        });
      });

      it('marks HTTP client 4xx spans as errors', () => {
        const httpClientSpan = createHttpSpan({
          n: 'node.http.client',
          k: 2,
          ec: 0,
          data: {
            http: {
              operation: 'get',
              path: '/missing',
              status: 404
            }
          }
        });

        const result = extractSpanMetadata(httpClientSpan, mappers.get(httpClientSpan));

        expect(result.kind).to.equal(3);
        expect(result.status).to.deep.equal({
          code: 2,
          message: 'http failed'
        });
      });
    });

    describe('spanAttributes', () => {
      it('extracts representative attributes for http, database, messaging, cloud and otel spans', () => {
        const httpSpan = createHttpSpan({
          data: {
            http: {
              operation: 'post',
              path: '/orders',
              endpoints: 'https://example.test/orders',
              status: 201,
              error: 'validation failed'
            }
          }
        });
        const pgSpan = createPgSpan();
        const mongoSpan = createSpan({
          n: 'mongo',
          data: {
            mongo: {
              command: 'find',
              service: 'mongodb://mongo.example.test:27017',
              namespace: 'users.accounts',
              collection: 'accounts',
              filter: '{"active":true}'
            }
          }
        });
        const rabbitmqSpan = createSpan({
          n: 'rabbitmq',
          data: {
            rabbitmq: {
              sort: 'publish',
              exchange: 'orders',
              key: 'orders.created',
              address: 'mq.example.test:5672'
            }
          }
        });
        const azureBlobSpan = createAzureBlobSpan();
        const otelSpan = createOtelSpan();

        const httpAttributes = extractSpanAttributes(httpSpan, mappers.get(httpSpan));
        expectAttribute(httpAttributes, 'http.method', { stringValue: 'POST' });
        expectAttribute(httpAttributes, 'http.status_code', { intValue: 201 });
        expectAttribute(httpAttributes, 'error.type', { stringValue: 'validation failed' });

        const pgAttributes = extractSpanAttributes(pgSpan, mappers.get(pgSpan));
        expectAttribute(pgAttributes, 'db.system', { stringValue: 'postgresql' });
        expectAttribute(pgAttributes, 'server.address', { stringValue: 'db.example.test' });
        expectAttribute(pgAttributes, 'server.port', { intValue: 5432 });

        const mongoAttributes = extractSpanAttributes(mongoSpan, mappers.get(mongoSpan));
        expectAttribute(mongoAttributes, 'db.system', { stringValue: 'mongodb' });
        expectAttribute(mongoAttributes, 'db.operation.name', { stringValue: 'FIND' });
        expectAttribute(mongoAttributes, 'db.collection.name', { stringValue: 'accounts' });
        expectAttribute(mongoAttributes, 'server.address', { stringValue: 'mongo.example.test' });
        expectAttribute(mongoAttributes, 'server.port', { intValue: 27017 });

        const rabbitmqAttributes = extractSpanAttributes(rabbitmqSpan, mappers.get(rabbitmqSpan));

        expectAttribute(rabbitmqAttributes, 'messaging.system', { stringValue: 'rabbitmq' });
        expectAttribute(rabbitmqAttributes, 'messaging.operation', { stringValue: 'publish' });
        expectAttribute(rabbitmqAttributes, 'messaging.destination', { stringValue: 'orders.orders.created' });
        expectAttribute(rabbitmqAttributes, 'server.address', { stringValue: 'mq.example.test' });
        expectAttribute(rabbitmqAttributes, 'server.port', { intValue: 5672 });

        const azureBlobAttributes = extractSpanAttributes(azureBlobSpan, mappers.get(azureBlobSpan));
        expectAttribute(azureBlobAttributes, 'cloud.provider', { stringValue: 'azure' });
        expect(azureBlobAttributes.some(attribute => attribute.value.stringValue === 'invoice.pdf')).to.be.true;

        const otelAttributes = extractSpanAttributes(otelSpan, mappers.get(otelSpan));
        expectAttribute(otelAttributes, 'operation', { stringValue: 'publish' });
        expectAttribute(otelAttributes, 'http.method', { stringValue: 'POST' });
        expectAttribute(otelAttributes, 'success', { boolValue: true });
      });

      it('extracts AWS Lambda invoke attributes', () => {
        const lambdaInvokeSpan = createAwsLambdaInvokeSpan();

        const attributes = extractSpanAttributes(lambdaInvokeSpan, mappers.get(lambdaInvokeSpan));
        expectAttribute(attributes, 'faas.name', { stringValue: 'my-function' });
        expectAttribute(attributes, 'faas.invocation_type', { stringValue: 'RequestResponse' });
        expectAttribute(attributes, 'cloud.provider', { stringValue: 'aws' });
        expectAttribute(attributes, 'cloud.platform', { stringValue: 'aws_lambda' });
      });

      it('extracts AWS Lambda invoke attributes with error', () => {
        const lambdaInvokeSpan = createAwsLambdaInvokeSpan({
          data: {
            'aws.lambda.invoke': {
              function: 'my-async-function',
              type: 'Event',
              error: 'Function not found'
            }
          }
        });

        const attributes = extractSpanAttributes(lambdaInvokeSpan, mappers.get(lambdaInvokeSpan));
        expectAttribute(attributes, 'faas.name', { stringValue: 'my-async-function' });
        expectAttribute(attributes, 'faas.invocation_type', { stringValue: 'Event' });
        expectAttribute(attributes, 'error.type', { stringValue: 'Function not found' });
      });

      it('extracts AWS Lambda entry attributes (API Gateway / cold start)', () => {
        const lambdaEntrySpan = createAwsLambdaEntrySpan();

        const attributes = extractSpanAttributes(lambdaEntrySpan, mappers.get(lambdaEntrySpan));
        expectAttribute(attributes, 'faas.trigger', { stringValue: 'http' });
        expectAttribute(attributes, 'faas.name', { stringValue: 'my-function' });
        expectAttribute(attributes, 'faas.version', { stringValue: '$LATEST' });
        expectAttribute(attributes, 'cloud.provider', { stringValue: 'aws' });
        expectAttribute(attributes, 'cloud.platform', { stringValue: 'aws_lambda' });
        expectAttribute(attributes, 'cloud.region', { stringValue: 'us-east-1' });
        expectAttribute(attributes, 'cloud.account.id', { stringValue: '123456789012' });
        expectAttribute(attributes, 'faas.invocation_id', { stringValue: 'abc-123-req-id' });
        expectAttribute(attributes, 'faas.coldstart', { boolValue: true });
        expectAttribute(attributes, 'process.runtime.name', { stringValue: 'nodejs' });
      });

      it('extracts AWS Lambda entry attributes (Lambda invoke trigger / error)', () => {
        const lambdaEntrySpan = createAwsLambdaEntrySpan({
          data: {
            lambda: {
              arn: 'arn:aws:lambda:eu-west-1:987654321098:function:error-function:3',
              functionName: 'error-function',
              functionVersion: '3',
              runtime: 'nodejs',
              reqId: 'def-456-req-id',
              trigger: 'aws:lambda.invoke',
              error: 'Task timed out after 30.00 seconds'
            }
          }
        });

        const attributes = extractSpanAttributes(lambdaEntrySpan, mappers.get(lambdaEntrySpan));
        expectAttribute(attributes, 'faas.trigger', { stringValue: 'other' });
        expectAttribute(attributes, 'cloud.region', { stringValue: 'eu-west-1' });
        expectAttribute(attributes, 'cloud.account.id', { stringValue: '987654321098' });
        expectAttribute(attributes, 'exception.message', { stringValue: 'Task timed out after 30.00 seconds' });
      });

      it('returns empty array for spans without data', () => {
        expect(extractSpanAttributes({ t: '123', s: '456' }, mappers.get({}))).to.deep.equal([]);
        expect(extractSpanAttributes(null, mappers.get({}))).to.deep.equal([]);
      });
    });
  });

  describe('aws lambda', () => {
    it('converts aws.lambda.invoke span', () => {
      const spans = [createAwsLambdaInvokeSpan({ t: 'trace-lambda', s: 'span-lambda-1', ts: 1710000000000, d: 50 })];
      const result = convert(spans);

      expect(result.resourceSpans).to.have.lengthOf(1);
      const convertedSpans = getConvertedSpans(result);
      expect(convertedSpans).to.have.lengthOf(1);

      const lambdaInvokeSpan = convertedSpans[0];
      expect(lambdaInvokeSpan.name).to.equal('Invoke my-function');
      expect(lambdaInvokeSpan.kind).to.equal(3);
      expectAttribute(lambdaInvokeSpan.attributes, 'faas.name', { stringValue: 'my-function' });
      expectAttribute(lambdaInvokeSpan.attributes, 'faas.invocation_type', { stringValue: 'RequestResponse' });
      expectAttribute(lambdaInvokeSpan.attributes, 'cloud.provider', { stringValue: 'aws' });
      expectAttribute(lambdaInvokeSpan.attributes, 'cloud.platform', { stringValue: 'aws_lambda' });
    });

    it('converts aws.lambda.entry span (API Gateway / cold start)', () => {
      const spans = [createAwsLambdaEntrySpan({ t: 'trace-lambda', s: 'span-lambda-2', ts: 1710000000000, d: 120 })];
      const result = convert(spans);

      const convertedSpans = getConvertedSpans(result);
      expect(convertedSpans).to.have.lengthOf(1);

      const lambdaEntrySpan = convertedSpans[0];
      expect(lambdaEntrySpan.name).to.equal('my-function');
      expect(lambdaEntrySpan.kind).to.equal(2);
      expectAttribute(lambdaEntrySpan.attributes, 'faas.trigger', { stringValue: 'http' });
      expectAttribute(lambdaEntrySpan.attributes, 'faas.name', { stringValue: 'my-function' });
      expectAttribute(lambdaEntrySpan.attributes, 'faas.version', { stringValue: '$LATEST' });
      expectAttribute(lambdaEntrySpan.attributes, 'cloud.provider', { stringValue: 'aws' });
      expectAttribute(lambdaEntrySpan.attributes, 'cloud.platform', { stringValue: 'aws_lambda' });
      expectAttribute(lambdaEntrySpan.attributes, 'cloud.region', { stringValue: 'us-east-1' });
      expectAttribute(lambdaEntrySpan.attributes, 'cloud.account.id', { stringValue: '123456789012' });
      expectAttribute(lambdaEntrySpan.attributes, 'faas.invocation_id', { stringValue: 'abc-123-req-id' });
      expectAttribute(lambdaEntrySpan.attributes, 'faas.coldstart', { boolValue: true });
      expectAttribute(lambdaEntrySpan.attributes, 'process.runtime.name', { stringValue: 'nodejs' });
    });

    it('converts aws.lambda.entry span (Lambda invoke trigger / error)', () => {
      const spans = [
        createAwsLambdaEntrySpan({
          t: 'trace-lambda',
          s: 'span-lambda-3',
          ts: 1710000000000,
          d: 30000,
          ec: 1,
          data: {
            lambda: {
              arn: 'arn:aws:lambda:eu-west-1:987654321098:function:error-function:3',
              functionName: 'error-function',
              functionVersion: '3',
              runtime: 'nodejs',
              reqId: 'def-456-req-id',
              trigger: 'aws:lambda.invoke',
              error: 'Task timed out after 30.00 seconds'
            }
          }
        })
      ];
      const result = convert(spans);

      const convertedSpans = getConvertedSpans(result);
      expect(convertedSpans).to.have.lengthOf(1);

      const lambdaEntrySpan = convertedSpans[0];
      expect(lambdaEntrySpan.name).to.equal('error-function');
      expect(lambdaEntrySpan.kind).to.equal(2);
      expect(lambdaEntrySpan.status).to.deep.equal({ code: 2, message: 'Task timed out after 30.00 seconds' });
      expectAttribute(lambdaEntrySpan.attributes, 'faas.trigger', { stringValue: 'other' });
      expectAttribute(lambdaEntrySpan.attributes, 'cloud.region', { stringValue: 'eu-west-1' });
      expectAttribute(lambdaEntrySpan.attributes, 'cloud.account.id', { stringValue: '987654321098' });
      expectAttribute(lambdaEntrySpan.attributes, 'exception.message', {
        stringValue: 'Task timed out after 30.00 seconds'
      });
    });
  });
});
