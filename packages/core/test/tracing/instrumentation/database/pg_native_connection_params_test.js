/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');

const pgNative = require('../../../../src/tracing/instrumentation/databases/pgNative');

// This test only tests the various methods to parse the connection parameters. The actual tracing integration test for
// pg-native is in packages/collector/test/tracing/databases/pg-native.

describe('tracing/pg-native should parse connection parameters', () => {
  describe('key value connection string', () => {
    it('should cope with null/undefined/empty string/not-a-string', () => {
      expect(pgNative.parseConnectionParameters(undefined)).to.deep.equal({});
      expect(pgNative.parseConnectionParameters(null)).to.deep.equal({});
      expect(pgNative.parseConnectionParameters('')).to.deep.equal({});
      expect(pgNative.parseConnectionParameters(() => {})).to.deep.equal({});
    });

    it('should parse a connection string', () => {
      expect(
        pgNative.parseConnectionParameters(
          ' host=pg-host application_name=foo  port=6543 dbname=the-db  user=the-user  connect_timeout=10 '
        )
      ).to.deep.equal({
        host: 'pg-host',
        port: '6543',
        db: 'the-db',
        user: 'the-user'
      });
    });

    it('should parse a partial connection string', () => {
      expect(pgNative.parseConnectionParameters('  host=pg-host   port=6543 ')).to.deep.equal({
        host: 'pg-host',
        port: '6543'
      });
    });

    it('should parse the hostaddr, too', () => {
      expect(pgNative.parseConnectionParameters('hostaddr=192.193.194.195')).to.deep.equal({
        host: '192.193.194.195'
      });
    });

    it('should ignore hosthostaddr if host is present', () => {
      expect(pgNative.parseConnectionParameters('hostaddr=192.193.194.195 host=pg-host')).to.deep.equal({
        host: 'pg-host'
      });
    });
  });

  describe('connection URI', () => {
    it('should parse a connection URI', () => {
      expect(
        pgNative.parseConnectionParameters(
          'postgresql://the-user:the-password@pg-host:6543/the-db?param1=value1&param2=value2'
        )
      ).to.deep.equal({
        host: 'pg-host',
        port: '6543',
        db: 'the-db',
        user: 'the-user'
      });
    });

    it('should parse partial connection URIs', () => {
      // no params
      expect(pgNative.parseConnectionParameters('postgres://the-user:the-password@pg-host:6543/the-db')).to.deep.equal({
        host: 'pg-host',
        port: '6543',
        db: 'the-db',
        user: 'the-user'
      });
      // no user
      expect(pgNative.parseConnectionParameters('postgres://:the-password@pg-host:6543/the-db')).to.deep.equal({
        host: 'pg-host',
        port: '6543',
        db: 'the-db'
      });
      // no password
      expect(pgNative.parseConnectionParameters('postgres://the-user@pg-host:6543/the-db')).to.deep.equal({
        host: 'pg-host',
        port: '6543',
        db: 'the-db',
        user: 'the-user'
      });
      // no host
      expect(pgNative.parseConnectionParameters('postgres://the-user:the-password@:6543/the-db')).to.deep.equal({
        port: '6543',
        db: 'the-db',
        user: 'the-user'
      });
      // no port
      expect(pgNative.parseConnectionParameters('postgres://the-user:the-password@pg-host/the-db')).to.deep.equal({
        host: 'pg-host',
        db: 'the-db',
        user: 'the-user'
      });
      // no database
      expect(
        pgNative.parseConnectionParameters('postgres://the-user:the-password@pg-host:6543?param=foo')
      ).to.deep.equal({
        host: 'pg-host',
        port: '6543',
        user: 'the-user'
      });
      // only host
      expect(pgNative.parseConnectionParameters('postgres://pg-host')).to.deep.equal({
        host: 'pg-host'
      });
      // host, port, db
      expect(pgNative.parseConnectionParameters('postgres://pg-host:6543/the-db')).to.deep.equal({
        host: 'pg-host',
        port: '6543',
        db: 'the-db'
      });
      // only user
      expect(pgNative.parseConnectionParameters('postgres://the-user@')).to.deep.equal({
        user: 'the-user'
      });
    });
  });

  describe('environment variables', () => {
    it('should read env vars', () => {
      setAndResetEnvVars(
        {
          PGHOST: 'pg-host',
          PGPORT: '6543',
          PGDATABASE: 'the-db',
          PGUSER: 'the-user'
        },
        () =>
          expect(
            pgNative.parseConnectionParameters(() => {
              // dummy connection callback
            })
          ).to.deep.equal({
            host: 'pg-host',
            port: '6543',
            db: 'the-db',
            user: 'the-user'
          })
      );
    });

    it('should also read PGHOSTADDR', () => {
      setAndResetEnvVars(
        {
          PGHOSTADDR: '192.193.194.195'
        },
        () =>
          expect(pgNative.parseConnectionParameters()).to.deep.equal({
            host: '192.193.194.195'
          })
      );
    });

    it('should prefer PGHOST over PGHOSTADDR', () => {
      setAndResetEnvVars(
        {
          PGHOST: 'pg-host',
          PGHOSTADDR: '192.193.194.195'
        },
        () =>
          expect(pgNative.parseConnectionParameters()).to.deep.equal({
            host: 'pg-host'
          })
      );
    });
  });

  function setAndResetEnvVars(envVars, test) {
    const originalValues = {};

    // set env vars for test
    Object.keys(envVars).forEach(key => {
      originalValues[key] = process.env[key];
      process.env[key] = envVars[key];
    });

    // run test/check expectations
    test();

    // reset env vars to their original values
    Object.keys(envVars).forEach(key => {
      if (originalValues[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = originalValues[key];
      }
    });
  }
});
