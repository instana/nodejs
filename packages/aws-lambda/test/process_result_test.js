/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

const expect = require('chai').expect;
const { cloneDeep } = require('lodash');

const processResult = require('../src/process_result');

describe('process lambda result', () => {
  let entrySpan;
  let anotherEntrySpan;

  const traceId = '112358d152237';
  const anotherTraceId = '1234566789abc';

  const emptyEntrySpan = {
    t: traceId,
    data: {
      lambda: {}
    }
  };
  const anotherEmptyEntrySpan = {
    t: anotherTraceId,
    data: {
      lambda: {}
    }
  };

  beforeEach(() => {
    entrySpan = cloneDeep(emptyEntrySpan);
    anotherEntrySpan = cloneDeep(anotherEmptyEntrySpan);
  });

  it('must cope with undefined result', () => {
    processResult(undefined, entrySpan);
    expect(entrySpan).to.deep.equal(emptyEntrySpan);
  });

  it('must cope with null result', () => {
    processResult(null, entrySpan);
    expect(entrySpan).to.deep.equal(emptyEntrySpan);
  });

  it('must cope with non-object string result', () => {
    processResult('Yo!', entrySpan);
    expect(entrySpan).to.deep.equal(emptyEntrySpan);
  });

  it('must cope with non-object array result', () => {
    processResult(['Yo!'], entrySpan);
    expect(entrySpan).to.deep.equal(emptyEntrySpan);
  });

  it('must cope with non-object number result', () => {
    processResult(42, entrySpan);
    expect(entrySpan).to.deep.equal(emptyEntrySpan);
  });

  it('must cope with non-object boolean result', () => {
    processResult(true, entrySpan);
    expect(entrySpan).to.deep.equal(emptyEntrySpan);
  });

  describe('HTTP status code', () => {
    it('must capture numerical HTTP status code', () => {
      processResult({ statusCode: 418 }, entrySpan);
      expect(entrySpan.data.http.status).to.equal(418);
      expect(entrySpan.ec).to.not.exist;
      expect(entrySpan.data.lambda.error).to.not.exist;
    });

    it('must capture string HTTP status code', () => {
      processResult({ statusCode: '418' }, entrySpan);
      expect(entrySpan.data.http.status).to.equal(418);
      expect(entrySpan.ec).to.not.exist;
      expect(entrySpan.data.lambda.error).to.not.exist;
    });

    it('must capture numerical 5xx HTTP status code and capture error', () => {
      processResult({ statusCode: 503 }, entrySpan);
      expect(entrySpan.data.http.status).to.equal(503);
      expect(entrySpan.ec).to.equal(1);
      expect(entrySpan.data.lambda.error).to.equal('HTTP status 503');
    });

    it('must capture numerical 5xx HTTP status code and capture error', () => {
      processResult({ statusCode: '503' }, entrySpan);
      expect(entrySpan.data.http.status).to.equal(503);
      expect(entrySpan.ec).to.equal(1);
      expect(entrySpan.data.lambda.error).to.equal('HTTP status 503');
    });

    it('must capture numerical 5xx HTTP status code and add to error count', () => {
      entrySpan.ec = 42;
      entrySpan.data.lambda.error = "Can't touch this!";
      processResult({ statusCode: 503 }, entrySpan);
      expect(entrySpan.data.http.status).to.equal(503);
      expect(entrySpan.ec).to.equal(43);
      expect(entrySpan.data.lambda.error).to.equal("Can't touch this!");
    });

    it('must capture numerical 5xx HTTP status code and add to error count', () => {
      entrySpan.ec = 42;
      entrySpan.data.lambda.error = "Can't touch this!";
      processResult({ statusCode: '503' }, entrySpan);
      expect(entrySpan.data.http.status).to.equal(503);
      expect(entrySpan.ec).to.equal(43);
      expect(entrySpan.data.lambda.error).to.equal("Can't touch this!");
    });
  });

  describe('detect Lambda proxy response', () => {
    it('must cope with undefined result', () => {
      expect(processResult._isLambdaProxyResponse(undefined)).to.be.false;
    });

    it('must cope with null result', () => {
      expect(processResult._isLambdaProxyResponse(null)).to.be.false;
    });

    it('must not identify random JSON object as a Lambda proxy response', () => {
      expect(
        processResult._isLambdaProxyResponse({
          some: 'attributes',
          but: 'no',
          indication: 'that this is a Lambda proxy response'
        })
      ).to.be.false;
    });

    it('must identify object with isBase64Encoded as a Lambda proxy response', () => {
      expect(processResult._isLambdaProxyResponse({ isBase64Encoded: false })).to.be.true;
    });

    it('must identify object with a numerical statusCode as a Lambda proxy response', () => {
      expect(processResult._isLambdaProxyResponse({ statusCode: 418 })).to.be.true;
    });

    it('must identify object with a string statusCode as a Lambda proxy response', () => {
      expect(processResult._isLambdaProxyResponse({ statusCode: '418' })).to.be.true;
    });

    it('must identify object with body and headers as a Lambda proxy response', () => {
      expect(processResult._isLambdaProxyResponse({ body: '...', headers: {} })).to.be.true;
    });

    it('must identify object with body and multiValueHeaders as a Lambda proxy response', () => {
      expect(processResult._isLambdaProxyResponse({ body: '...', multiValueHeaders: {} })).to.be.true;
    });

    it('must not identify object with only body as a Lambda proxy response', () => {
      expect(processResult._isLambdaProxyResponse({ body: '...' })).to.be.false;
    });

    it('must not identify object with only headers as a Lambda proxy response', () => {
      expect(processResult._isLambdaProxyResponse({ headers: {} })).to.be.false;
    });

    it('must not identify object with only multiValueHeaders as a Lambda proxy response', () => {
      expect(processResult._isLambdaProxyResponse({ multiValueHeaders: {} })).to.be.false;
    });
  });

  describe('EUM back end correlation Server-Timing header', () => {
    it('must add a single value header when there are neither single nor multi value headers', () => {
      const result = { statusCode: 200 };
      processResult(result, entrySpan);
      expect(result.headers).to.be.an('object');
      expect(result.headers).to.deep.equal({ 'Server-Timing': `intid;desc=${traceId}` });
    });

    describe('only single value headers are present', () => {
      it('must add header if there is no Server-Timing header yet', () => {
        const result = { statusCode: 200, headers: { 'x-custom-header': 'value' } };
        processResult(result, entrySpan);
        expect(result.headers).to.deep.equal({
          'x-custom-header': 'value',
          'Server-Timing': `intid;desc=${traceId}`
        });
        expect(result.multiValueHeaders).to.not.exist;
      });

      it('must concat header to existing string value', () => {
        const result = {
          statusCode: 200,
          headers: {
            'x-custom-header': 'value',
            'sErver-timinG': 'cache;desc="Cache Read";dur=23.2'
          }
        };
        processResult(result, entrySpan);
        expect(result.headers).to.deep.equal({
          'x-custom-header': 'value',
          'sErver-timinG': `cache;desc="Cache Read";dur=23.2, intid;desc=${traceId}`
        });
        expect(result.multiValueHeaders).to.not.exist;
      });

      it('must replace initd value if it already exists', () => {
        const result = {
          statusCode: 200,
          headers: {
            'x-custom-header': 'value',
            'sErver-timinG': 'cache;desc="Cache Read";dur=23.2'
          }
        };

        // This is particularly important if customer code keeps re-using the same result object, so we explicitly
        // simulate this pattern.
        processResult(result, entrySpan);
        processResult(result, anotherEntrySpan);

        expect(result.headers).to.deep.equal({
          'x-custom-header': 'value',
          'sErver-timinG': `cache;desc="Cache Read";dur=23.2, intid;desc=${anotherTraceId}`
        });
        expect(result.multiValueHeaders).to.not.exist;
      });
    });

    describe('only multi value headers are present', () => {
      it('must add header if there is no Server-Timing header yet', () => {
        const result = { statusCode: 200, multiValueHeaders: { 'x-custom-header': ['value1', 'value2'] } };
        processResult(result, entrySpan);
        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header': ['value1', 'value2'],
          'Server-Timing': [`intid;desc=${traceId}`]
        });
        expect(result.headers).to.not.exist;
      });

      it('must put header into existing empty multi value array', () => {
        const result = {
          statusCode: 200,
          multiValueHeaders: {
            'x-custom-header': 'value',
            'sErver-timinG': []
          }
        };
        processResult(result, entrySpan);
        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header': 'value',
          'sErver-timinG': [`intid;desc=${traceId}`]
        });
        expect(result.headers).to.not.exist;
      });

      it('must concat header to first entry in array', () => {
        const result = {
          statusCode: 200,
          multiValueHeaders: {
            'x-custom-header': 'value',
            'sErver-timinG': ['cache;desc="Cache Read";dur=23.2', 'somethingelse']
          }
        };
        processResult(result, entrySpan);
        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header': 'value',
          'sErver-timinG': [`cache;desc="Cache Read";dur=23.2, intid;desc=${traceId}`, 'somethingelse']
        });
        expect(result.headers).to.not.exist;
      });

      it('must replace initd value if it already exists in first array entry', () => {
        const result = {
          statusCode: 200,
          multiValueHeaders: {
            'x-custom-header': 'value',
            'sErver-timinG': ['cache;desc="Cache Read";dur=23.2', 'somethingelse']
          }
        };

        // This is particularly important if customer code keeps re-using the same result object, so we explicitly
        // simulate this pattern.
        processResult(result, entrySpan);
        processResult(result, anotherEntrySpan);

        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header': 'value',
          'sErver-timinG': [`cache;desc="Cache Read";dur=23.2, intid;desc=${anotherTraceId}`, 'somethingelse']
        });
        expect(result.headers).to.not.exist;
      });

      it('must concat header to string value', () => {
        // The AWS docs say "The multiValueHeaders key can contain multi-value headers as well as single-value headers."
        // It is not entirely clear if that means that a multiValueHeaders is simply allowed to have single element
        // arrays or also string values.
        const result = {
          statusCode: 200,
          multiValueHeaders: {
            'x-custom-header': ['value1', 'value2'],
            'sErver-timinG': 'cache;desc="Cache Read";dur=23.2'
          }
        };
        processResult(result, entrySpan);
        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header': ['value1', 'value2'],
          'sErver-timinG': `cache;desc="Cache Read";dur=23.2, intid;desc=${traceId}`
        });
        expect(result.headers).to.not.exist;
      });

      it('must replace initd value in multi value header with string value', () => {
        // The AWS docs say "The multiValueHeaders key can contain multi-value headers as well as single-value headers."
        // It is not entirely clear if that means that a multiValueHeaders is simply allowed to have single element
        // arrays or also string values.
        const result = {
          statusCode: 200,
          multiValueHeaders: {
            'x-custom-header': ['value1', 'value2'],
            'sErver-timinG': 'cache;desc="Cache Read";dur=23.2'
          }
        };

        // This is particularly important if customer code keeps re-using the same result object, so we explicitly
        // simulate this pattern.
        processResult(result, entrySpan);
        processResult(result, anotherEntrySpan);

        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header': ['value1', 'value2'],
          'sErver-timinG': `cache;desc="Cache Read";dur=23.2, intid;desc=${anotherTraceId}`
        });
        expect(result.headers).to.not.exist;
      });
    });

    describe('both single value headers and multi value headers are present', () => {
      it('must add header to multi value headers if neither have a Server-Timing', () => {
        const result = {
          statusCode: 200,
          headers: { 'x-custom-header-1': 'value' },
          multiValueHeaders: { 'x-custom-header-2': ['value1', 'value2'] }
        };
        processResult(result, entrySpan);
        expect(result.headers).to.deep.equal({
          'x-custom-header-1': 'value'
        });
        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header-2': ['value1', 'value2'],
          'Server-Timing': [`intid;desc=${traceId}`]
        });
      });

      it('must add header to existing single value header', () => {
        const result = {
          statusCode: 200,
          headers: { 'x-custom-header-1': 'value', 'sErVeR-tImInG': 'cpu;dur=2.4' },
          multiValueHeaders: { 'x-custom-header-2': ['value1', 'value2'] }
        };
        processResult(result, entrySpan);
        expect(result.headers).to.deep.equal({
          'x-custom-header-1': 'value',
          'sErVeR-tImInG': `cpu;dur=2.4, intid;desc=${traceId}`
        });
        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header-2': ['value1', 'value2']
        });
      });

      it('must replace initd value in existing single value header', () => {
        const result = {
          statusCode: 200,
          headers: { 'x-custom-header-1': 'value', 'sErVeR-tImInG': 'cpu;dur=2.4' },
          multiValueHeaders: { 'x-custom-header-2': ['value1', 'value2'] }
        };

        // This is particularly important if customer code keeps re-using the same result object, so we explicitly
        // simulate this pattern.
        processResult(result, entrySpan);
        processResult(result, anotherEntrySpan);

        expect(result.headers).to.deep.equal({
          'x-custom-header-1': 'value',
          'sErVeR-tImInG': `cpu;dur=2.4, intid;desc=${anotherTraceId}`
        });
        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header-2': ['value1', 'value2']
        });
      });

      it('must add header to existing multi value header', () => {
        const result = {
          statusCode: 200,
          headers: { 'x-custom-header-1': 'value' },
          multiValueHeaders: {
            'x-custom-header-2': ['value1', 'value2'],
            'sErVeR-tImInG': ['cpu;dur=2.4', 'somethingelse']
          }
        };
        processResult(result, entrySpan);
        expect(result.headers).to.deep.equal({ 'x-custom-header-1': 'value' });
        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header-2': ['value1', 'value2'],
          'sErVeR-tImInG': [`cpu;dur=2.4, intid;desc=${traceId}`, 'somethingelse']
        });
      });

      it('must add header to existing multi value header if both have a Server-Timing header', () => {
        const result = {
          statusCode: 200,
          headers: { 'x-custom-header-1': 'value' },
          multiValueHeaders: {
            'x-custom-header-2': ['value1', 'value2'],
            'sErVeR-tImInG': ['cpu;dur=2.4', 'somethingelse']
          }
        };
        processResult(result, entrySpan);
        expect(result.headers).to.deep.equal({ 'x-custom-header-1': 'value' });
        expect(result.multiValueHeaders).to.deep.equal({
          'x-custom-header-2': ['value1', 'value2'],
          'sErVeR-tImInG': [`cpu;dur=2.4, intid;desc=${traceId}`, 'somethingelse']
        });
      });
    });
  });
});
