/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');

const { convert } = require('../../../../src/otlp/traces/converter');
const { extractSpanMetadata } = require('../../../../src/otlp/traces/transformers/spanMetaData');
const { extractSpanAttributes } = require('../../../../src/otlp/traces/transformers/spanAttributes');

describe('tracing/converters/otlp', () => {
  function loadInputFixture(filename) {
    const fixturePath = path.join(__dirname, 'fixtures/input', filename);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  function loadOutputFixture(filename) {
    const fixturePath = path.join(__dirname, 'fixtures/output', filename);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  function loadTransformerInputFixture(filename) {
    const fixturePath = path.join(__dirname, 'transformers/fixtures/input', filename);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  function loadTransformerOutputFixture(filename) {
    const fixturePath = path.join(__dirname, 'transformers/fixtures/output', filename);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  describe('converter', () => {
    describe('basic conversion', () => {
      it('should convert single HTTP span correctly', () => {
        const input = [loadInputFixture('input-single-http.json')];
        const expectedOutput = loadOutputFixture('output-single-http.json');

        const result = convert(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('should convert single otel span correctly', () => {
        const input = [loadInputFixture('otel.json')];
        const expectedOutput = loadOutputFixture('output-otel.json');

        const result = convert(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('should return empty resourceSpans for empty input', () => {
        const result = convert([]);
        expect(result).to.deep.equal({ resourceSpans: [] });
      });

      it('should return empty resourceSpans for null input', () => {
        const result = convert(null);
        expect(result).to.deep.equal({ resourceSpans: [] });
      });
    });

    describe('error handling', () => {
      it('should handle spans with missing required fields gracefully', () => {
        const invalidSpan = { n: 'test' };
        const result = convert([invalidSpan]);

        expect(result).to.have.property('resourceSpans');
        expect(result.resourceSpans).to.be.an('array');
      });

      it('should skip null spans in array', () => {
        const validSpan = loadInputFixture('input-single-http.json');
        const result = convert([null, validSpan, null]);

        expect(result).to.have.property('resourceSpans');
        expect(result.resourceSpans).to.be.an('array');
      });

      it('should filter out log spans', () => {
        const logSpan = {
          t: '123',
          s: '456',
          n: 'log.console',
          data: { log: { message: 'test' } }
        };
        const result = convert([logSpan]);

        expect(result.resourceSpans).to.have.lengthOf(0);
      });
    });

    describe('resource grouping', () => {
      it.skip('should group spans with same resource attributes', () => {
        const input = loadInputFixture('converter-input-multiple-same-resource.json');
        const expectedOutput = loadOutputFixture('converter-output-multiple-same-resource.json');

        const result = convert(input);

        expect(result).to.deep.equal(expectedOutput);
        expect(result.resourceSpans).to.have.lengthOf(1);
      });

      it.skip('should separate spans with different resource attributes', () => {
        const input = loadInputFixture('converter-input-multiple-different-resources.json');
        const expectedOutput = loadOutputFixture('converter-output-multiple-different-resources.json');

        const result = convert(input);

        expect(result).to.deep.equal(expectedOutput);
        expect(result.resourceSpans.length).to.be.greaterThan(1);
      });
    });
  });

  describe('transformers', () => {
    describe('spanMetaData', () => {
      it('should extract HTTP server span metadata correctly', () => {
        const input = loadTransformerInputFixture('http.json');
        const expectedOutput = loadTransformerOutputFixture('metaData/http.json');

        const result = extractSpanMetadata(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('should extract Kafka producer span metadata correctly', () => {
        const input = loadTransformerInputFixture('kafka.json');
        const expectedOutput = loadTransformerOutputFixture('metaData/kafka.json');

        const result = extractSpanMetadata(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('should extract MongoDB error span metadata correctly', () => {
        const input = loadTransformerInputFixture('mongodb.json');
        const expectedOutput = loadTransformerOutputFixture('metaData/mongodb.json');

        const result = extractSpanMetadata(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('should extract otel span metadata correctly', () => {
        const input = loadTransformerInputFixture('otel.json');
        const expectedOutput = loadTransformerOutputFixture('metaData/otel.json');

        const result = extractSpanMetadata(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('should return empty object for null span', () => {
        const result = extractSpanMetadata(null);
        expect(result).to.deep.equal({});
      });

      it('should return empty object for undefined span', () => {
        const result = extractSpanMetadata(undefined);
        expect(result).to.deep.equal({});
      });
    });

    describe('spanAttributes', () => {
      it('should extract HTTP span attributes correctly', () => {
        const input = loadTransformerInputFixture('http.json');
        const expectedOutput = loadTransformerOutputFixture('dataAttributes/http.json');

        const result = extractSpanAttributes(input);

        expect(result).to.be.an('array');
        expect(result).to.have.lengthOf(expectedOutput.length);

        expectedOutput.forEach(expectedAttr => {
          const actualAttr = result.find(attr => attr.key === expectedAttr.key);
          expect(actualAttr, `Missing attribute: ${expectedAttr.key}`).to.exist;
          expect(actualAttr.value).to.deep.equal(expectedAttr.value);
        });
      });

      it('should extract Kafka span attributes with peer data correctly', () => {
        const input = loadTransformerInputFixture('kafka.json');
        const expectedOutput = loadTransformerOutputFixture('dataAttributes/kafka.json');

        const result = extractSpanAttributes(input);

        expect(result).to.be.an('array');
        expect(result.length).to.be.at.least(expectedOutput.length);

        expectedOutput.forEach(expectedAttr => {
          const actualAttr = result.find(
            attr => attr.key === expectedAttr.key && JSON.stringify(attr.value) === JSON.stringify(expectedAttr.value)
          );
          expect(actualAttr, `Missing or incorrect attribute: ${expectedAttr.key}`).to.exist;
        });
      });

      it('should extract MongoDB span attributes with peer data correctly', () => {
        const input = loadTransformerInputFixture('mongodb.json');
        const expectedOutput = loadTransformerOutputFixture('dataAttributes/mongodb.json');

        const result = extractSpanAttributes(input);
        console.log(result);

        expect(result).to.be.an('array');
        expect(result).to.have.lengthOf(expectedOutput.length);

        expectedOutput.forEach(expectedAttr => {
          const actualAttr = result.find(attr => attr.key === expectedAttr.key);
          expect(actualAttr, `Missing attribute: ${expectedAttr.key}`).to.exist;
          expect(actualAttr.value).to.deep.equal(expectedAttr.value);
        });
      });

      it('should extract PostgreSQL span attributes correctly', () => {
        const input = loadTransformerInputFixture('postgresql.json');
        const expectedOutput = loadTransformerOutputFixture('dataAttributes/postgresql.json');

        const result = extractSpanAttributes(input);

        expect(result).to.be.an('array');
        expect(result).to.have.lengthOf(expectedOutput.length);

        expectedOutput.forEach(expectedAttr => {
          const actualAttr = result.find(attr => attr.key === expectedAttr.key);
          expect(actualAttr, `Missing attribute: ${expectedAttr.key}`).to.exist;
          expect(actualAttr.value).to.deep.equal(expectedAttr.value);
        });
      });

      it('should extract otel span attributes correctly', () => {
        const input = loadTransformerInputFixture('otel.json');
        const expectedOutput = loadTransformerOutputFixture('dataAttributes/otel.json');

        const result = extractSpanAttributes(input);

        expect(result).to.be.an('array');
        expect(result).to.have.lengthOf(expectedOutput.length);

        expectedOutput.forEach(expectedAttr => {
          const actualAttr = result.find(attr => attr.key === expectedAttr.key);
          expect(actualAttr, `Missing attribute: ${expectedAttr.key}`).to.exist;
          expect(actualAttr.value).to.deep.equal(expectedAttr.value);
        });
      });

      it('should return empty array for span without data', () => {
        const result = extractSpanAttributes({ t: '123', s: '456' });
        expect(result).to.deep.equal([]);
      });

      it('should return empty array for null span', () => {
        const result = extractSpanAttributes(null);
        expect(result).to.deep.equal([]);
      });
    });

    describe.skip('resourceAttributes', () => {
      it('should extract resource attributes with default values', () => {
        const span = {
          t: '123',
          s: '456',
          data: {}
        };

        // const result = extractResourceAttributes(span);

        // expect(result).to.be.an('array');
        // expect(result.length).to.be.greaterThan(0);

        // const serviceNameAttr = result.find(attr => attr.key === 'service.name');
        // expect(serviceNameAttr).to.exist;
        // expect(serviceNameAttr.value.stringValue).to.equal('unknown_service');
      });

      it('should extract resource attributes from span data', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            service: 'my-service',
            resource: {
              'telemetry.sdk.name': 'custom-sdk',
              'telemetry.sdk.version': '1.0.0'
            }
          }
        };

        // const result = extractResourceAttributes(span);

        // expect(result).to.be.an('array');

        // const serviceNameAttr = result.find(attr => attr.key === 'service.name');
        // expect(serviceNameAttr.value.stringValue).to.equal('my-service');

        // const sdkNameAttr = result.find(attr => attr.key === 'telemetry.sdk.name');
        // expect(sdkNameAttr.value.stringValue).to.equal('custom-sdk');
      });

      it('should return empty array for null span', () => {
        //  const result = extractResourceAttributes(null);
        // expect(result).to.deep.equal([]);
      });
    });
  });

  describe('mappers', () => {
    describe('http', () => {
      it('should map HTTP method to uppercase', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            http: {
              method: 'get',
              path: '/api/users',
              status: 200
            }
          }
        };

        const result = extractSpanAttributes(span);
        const methodAttr = result.find(attr => attr.key === 'http.method');

        expect(methodAttr).to.exist;
        expect(methodAttr.value.stringValue).to.equal('GET');
      });

      it('should map HTTP status code', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            http: {
              method: 'post',
              path: '/api/users',
              status: 201
            }
          }
        };

        const result = extractSpanAttributes(span);
        const statusAttr = result.find(attr => attr.key === 'http.status_code');

        expect(statusAttr).to.exist;
        expect(statusAttr.value.intValue).to.equal(201);
      });

      it('should map HTTP error', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            http: {
              method: 'get',
              path: '/api/error',
              status: 500,
              error: 'Internal Server Error'
            }
          }
        };

        const result = extractSpanAttributes(span);
        const errorAttr = result.find(attr => attr.key === 'error.type');

        expect(errorAttr).to.exist;
        expect(errorAttr.value.stringValue).to.equal('Internal Server Error');
      });
    });

    describe('database', () => {
      it('should map PostgreSQL attributes', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            pg: {
              stmt: 'SELECT * FROM users',
              host: 'localhost',
              port: 5432,
              db: 'mydb',
              user: 'admin'
            }
          }
        };

        const result = extractSpanAttributes(span);

        const systemAttr = result.find(attr => attr.key === 'db.system');
        expect(systemAttr).to.exist;
        expect(systemAttr.value.stringValue).to.equal('postgresql');

        const stmtAttr = result.find(attr => attr.key === 'db.statement');
        expect(stmtAttr).to.exist;
        expect(stmtAttr.value.stringValue).to.equal('SELECT * FROM users');

        const dbAttr = result.find(attr => attr.key === 'db.name');
        expect(dbAttr).to.exist;
        expect(dbAttr.value.stringValue).to.equal('mydb');
      });

      it('should map MongoDB attributes', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            mongo: {
              command: 'find',
              service: 'mongodb://localhost:27017',
              namespace: 'mydb.users',
              filter: '{"age": {"$gt": 18}}'
            }
          }
        };

        const result = extractSpanAttributes(span);

        const systemAttr = result.find(attr => attr.key === 'db.system');
        expect(systemAttr).to.exist;
        expect(systemAttr.value.stringValue).to.equal('mongodb');

        const operationAttr = result.find(attr => attr.key === 'db.operation.name');
        expect(operationAttr).to.exist;
        expect(operationAttr.value.stringValue).to.equal('FIND');
      });
    });

    describe('messaging', () => {
      it('should map Kafka attributes', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            kafka: {
              access: 'send',
              service: 'my-topic'
            }
          }
        };

        const result = extractSpanAttributes(span);

        const systemAttr = result.find(attr => attr.key === 'messaging.system');
        expect(systemAttr).to.exist;
        expect(systemAttr.value.stringValue).to.equal('kafka');

        const destAttr = result.find(attr => attr.key === 'messaging.destination');
        expect(destAttr).to.exist;
      });

      it('should map RabbitMQ attributes', () => {
        const span = {
          t: '123',
          s: '456',
          data: {
            rabbitmq: {
              sort: 'publish',
              exchange: 'my-exchange',
              key: 'routing.key',
              address: 'localhost:5672'
            }
          }
        };

        const result = extractSpanAttributes(span);

        const systemAttr = result.find(attr => attr.key === 'messaging.system');
        expect(systemAttr).to.exist;
        expect(systemAttr.value.stringValue).to.equal('rabbitmq');
      });
    });
  });
});
