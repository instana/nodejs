/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');
const util = require('../../src/util/bindVariables');

describe('tracing.bindVariables', function () {
  describe('isCaptureEnabled', function () {
    it('should return false when config is undefined', function () {
      expect(util.isCaptureEnabled(undefined)).to.be.false;
    });

    it('should return false when disable=true', function () {
      expect(util.isCaptureEnabled({ disable: true, allowedColumns: ['id'] })).to.be.false;
    });

    it('should return false when allowedColumns is empty', function () {
      expect(util.isCaptureEnabled({ disable: false, allowedColumns: [] })).to.be.false;
    });

    it('should return true when disable=false and allowedColumns is non-empty', function () {
      expect(util.isCaptureEnabled({ disable: false, allowedColumns: ['id'] })).to.be.true;
    });
  });

  describe('isColumnAllowed', function () {
    it('unqualified entry matches bare column name', function () {
      expect(util.isColumnAllowed('username', ['username'])).to.be.true;
    });

    it('unqualified entry matches qualified column (any prefix)', function () {
      expect(util.isColumnAllowed('orders.user_id', ['user_id'])).to.be.true;
      expect(util.isColumnAllowed('o.user_id', ['user_id'])).to.be.true;
    });

    it('qualified entry matches exact qualified form only', function () {
      expect(util.isColumnAllowed('orders.user_id', ['orders.user_id'])).to.be.true;
    });

    it('qualified entry does NOT match bare column name', function () {
      expect(util.isColumnAllowed('user_id', ['orders.user_id'])).to.be.false;
    });

    it('qualified entry does NOT match a different qualifier', function () {
      expect(util.isColumnAllowed('items.user_id', ['orders.user_id'])).to.be.false;
    });

    it('returns false when column is not in list', function () {
      expect(util.isColumnAllowed('password', ['username', 'email'])).to.be.false;
    });
  });

  describe('normalizeValue', function () {
    it('converts null to "null"', function () {
      expect(util.normalizeValue(null)).to.equal('null');
    });

    it('converts undefined to "null"', function () {
      expect(util.normalizeValue(undefined)).to.equal('null');
    });

    it('converts Buffer to "<binary>"', function () {
      expect(util.normalizeValue(Buffer.from('data'))).to.equal('<binary>');
    });

    it('converts plain object to JSON string', function () {
      expect(util.normalizeValue({ foo: 'bar' })).to.equal('{"foo":"bar"}');
    });

    it('converts array to JSON string', function () {
      expect(util.normalizeValue([1, 2, 3])).to.equal('[1,2,3]');
    });

    it('converts circular object to "<unsupported>"', function () {
      const circular = {};
      circular.self = circular;
      expect(util.normalizeValue(circular)).to.equal('<unsupported>');
    });

    it('converts number to string', function () {
      expect(util.normalizeValue(42)).to.equal('42');
    });

    it('converts boolean to string', function () {
      expect(util.normalizeValue(true)).to.equal('true');
    });

    it('passes strings through', function () {
      expect(util.normalizeValue('hello')).to.equal('hello');
    });
  });

  describe('buildBindsFromPositional', function () {
    it('returns null when no column names can be resolved', function () {
      const result = util.buildBindsFromPositional([42, 'secret'], [undefined, undefined], ['id']);
      expect(result).to.equal(null);
    });

    it('skips unresolvable positions', function () {
      // $1 → id, $2 → unresolvable
      const result = util.buildBindsFromPositional([42, 'secret'], ['id', undefined], ['id']);
      expect(result).to.deep.equal([{ name: 'id', value: '42' }]);
    });

    it('skips columns not in allowedColumns', function () {
      const result = util.buildBindsFromPositional(['john', 'secret'], ['username', 'password'], ['username']);
      expect(result).to.deep.equal([{ name: 'username', value: 'john' }]);
    });

    it('caps at 100 entries', function () {
      const values = Array.from({ length: 110 }, (_, i) => i);
      const colNames = Array.from({ length: 110 }, () => 'col');
      const result = util.buildBindsFromPositional(values, colNames, ['col']);
      expect(result).to.have.length(100);
    });
  });

  describe('resolveColumnNamesDollarParams', function () {
    it('resolves a single equality condition', function () {
      const r = util.resolveColumnNamesDollarParams('SELECT * FROM t WHERE id = $1', 1);
      expect(r[0]).to.equal('id');
    });

    it('resolves multiple conditions', function () {
      const r = util.resolveColumnNamesDollarParams('SELECT * FROM t WHERE username = $1 AND password = $2', 2);
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('password');
    });

    it('resolves table-qualified column names', function () {
      const r = util.resolveColumnNamesDollarParams('SELECT * FROM orders WHERE orders.user_id = $1', 1);
      expect(r[0]).to.equal('orders.user_id');
    });

    it('resolves comparison operators other than =', function () {
      const r = util.resolveColumnNamesDollarParams('SELECT * FROM t WHERE age >= $1 AND score < $2', 2);
      expect(r[0]).to.equal('age');
      expect(r[1]).to.equal('score');
    });

    it('resolves LIKE and ILIKE operators', function () {
      const r = util.resolveColumnNamesDollarParams('SELECT * FROM t WHERE name LIKE $1 AND bio ILIKE $2', 2);
      expect(r[0]).to.equal('name');
      expect(r[1]).to.equal('bio');
    });

    it('leaves INSERT VALUES positions as undefined', function () {
      const r = util.resolveColumnNamesDollarParams('INSERT INTO users (username, email) VALUES ($1, $2)', 2);
      expect(r[0]).to.equal(undefined);
      expect(r[1]).to.equal(undefined);
    });

    it('resolves UPDATE SET conditions', function () {
      const r = util.resolveColumnNamesDollarParams('UPDATE users SET username = $1, email = $2 WHERE id = $3', 3);
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('email');
      expect(r[2]).to.equal('id');
    });

    it('resolves DELETE WHERE conditions', function () {
      const r = util.resolveColumnNamesDollarParams('DELETE FROM users WHERE name = $1 AND email = $2', 2);
      expect(r[0]).to.equal('name');
      expect(r[1]).to.equal('email');
    });
  });

  describe('captureBinds', function () {
    const enabledConfig = { disable: false, allowedColumns: ['name'] };
    const disabledConfig = { disable: true, allowedColumns: ['name'] };

    it('returns null when capture is disabled', function () {
      const result = util.captureBinds(
        'SELECT * FROM users WHERE name = $1',
        'SELECT * FROM users WHERE name = $1',
        ['SELECT * FROM users WHERE name = $1', ['alice']],
        disabledConfig
      );
      expect(result).to.equal(null);
    });

    it('returns null when config is undefined', function () {
      const result = util.captureBinds(
        'SELECT * FROM users WHERE name = $1',
        'SELECT * FROM users WHERE name = $1',
        ['SELECT * FROM users WHERE name = $1', ['alice']],
        undefined
      );
      expect(result).to.equal(null);
    });

    it('extracts values from string query + positional array', function () {
      const sql = 'SELECT * FROM users WHERE name = $1';
      const result = util.captureBinds(sql, sql, [sql, ['alice']], enabledConfig);
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('extracts values from config object with values property', function () {
      const sql = 'SELECT * FROM users WHERE name = $1';
      const config = { text: sql, values: ['alice'] };
      const result = util.captureBinds(sql, config, [config], enabledConfig);
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('returns null when string query has no values array', function () {
      const sql = 'SELECT * FROM users WHERE name = $1';
      const result = util.captureBinds(sql, sql, [sql], enabledConfig);
      expect(result).to.equal(null);
    });

    it('returns null when config object has no values property', function () {
      const sql = 'SELECT * FROM users WHERE name = $1';
      const config = { text: sql };
      const result = util.captureBinds(sql, config, [config], enabledConfig);
      expect(result).to.equal(null);
    });

    it('applies allowed-columns filter', function () {
      const sql = 'SELECT * FROM users WHERE name = $1 AND email = $2';
      const result = util.captureBinds(sql, sql, [sql, ['alice', 'alice@example.com']], enabledConfig);
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('resolves DELETE WHERE conditions', function () {
      const sql = 'DELETE FROM users WHERE name = $1 AND email = $2';
      const result = util.captureBinds(sql, sql, [sql, ['deleteuser', 'delete@example.com']], enabledConfig);
      expect(result).to.deep.equal([{ name: 'name', value: 'deleteuser' }]);
    });
  });
});
