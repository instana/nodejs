/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { expect } = require('chai');

const prisma = require('../../../../src/tracing/instrumentation/databases/prisma');

describe('tracing/prisma should redact the password from the connection URL', () => {
  [
    {
      provider: 'cockroachdb',
      capturedUrl: 'postgresql://user_name:secret@hostname:1234/database_name?schema=public',
      expectedUrl: 'postgresql://user_name:_redacted_@hostname:1234/database_name?schema=public'
    },
    {
      provider: 'mongodb',
      capturedUrl: 'mongodb://user_name:secret@hostname:9876/database_name',
      expectedUrl: 'mongodb://user_name:_redacted_@hostname:9876/database_name'
    },
    {
      provider: 'mysql',
      capturedUrl: 'mysql://user_name:secret@hostname:9876/database_name',
      expectedUrl: 'mysql://user_name:_redacted_@hostname:9876/database_name'
    },
    {
      provider: 'postgresql',
      capturedUrl: 'postgresql://user_name:secret@hostname:1234/database_name?schema=public',
      expectedUrl: 'postgresql://user_name:_redacted_@hostname:1234/database_name?schema=public'
    },
    {
      provider: 'sqlserver',
      capturedUrl: 'sqlserver://hostname:9876;database=database_name;user=user_name;password=secret;encrypt=true',
      expectedUrl: 'sqlserver://hostname:9876;database=database_name;user=user_name;password=_redacted_;encrypt=true'
    },
    {
      provider: 'sqlite',
      capturedUrl: 'file:./dev.db',
      expectedUrl: 'file:./dev.db'
    },
    {
      provider: 'unknown',
      capturedUrl: 'protocol://user_name:password@hostname:1234/database_name',
      expectedUrl: null
    },
    {
      provider: 'postgresql',
      capturedUrl: 'not a parseable URI',
      expectedUrl: null
    }
  ].forEach(({ provider, capturedUrl, expectedUrl }, idx) => {
    it(`for provider ${provider} (test case: ${idx})`, () => {
      expect(prisma._redactPassword(provider, capturedUrl)).to.equal(expectedUrl);
    });
  });
});
