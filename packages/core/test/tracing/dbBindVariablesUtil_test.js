/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { expect } = require('chai');
const util = require('../../src/tracing/dbBindVariablesUtil');

describe('tracing.dbBindVariablesUtil', function () {
  // ---------------------------------------------------------------------------
  // isActive
  // ---------------------------------------------------------------------------
  describe('isActive', function () {
    it('should return false when config is undefined', function () {
      expect(util.isActive(undefined)).to.be.false;
    });

    it('should return false when disable=true', function () {
      expect(util.isActive({ disable: true, allowedColumns: ['id'] })).to.be.false;
    });

    it('should return false when allowedColumns is empty', function () {
      expect(util.isActive({ disable: false, allowedColumns: [] })).to.be.false;
    });

    it('should return true when disable=false and allowedColumns is non-empty', function () {
      expect(util.isActive({ disable: false, allowedColumns: ['id'] })).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  // isColumnAllowed
  // ---------------------------------------------------------------------------
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

    it('matching is case-insensitive', function () {
      expect(util.isColumnAllowed('UserName', ['username'])).to.be.true;
      expect(util.isColumnAllowed('username', ['UserName'])).to.be.true;
    });

    it('returns false when column is not in list', function () {
      expect(util.isColumnAllowed('password', ['username', 'email'])).to.be.false;
    });
  });

  // ---------------------------------------------------------------------------
  // normalizeValue
  // ---------------------------------------------------------------------------
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

    it('converts plain object to "<unsupported>"', function () {
      expect(util.normalizeValue({ foo: 'bar' })).to.equal('<unsupported>');
    });

    it('converts array to "<unsupported>"', function () {
      expect(util.normalizeValue([1, 2, 3])).to.equal('<unsupported>');
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

  // ---------------------------------------------------------------------------
  // buildBindsFromNamed
  // ---------------------------------------------------------------------------
  describe('buildBindsFromNamed', function () {
    it('returns null when no entries match allowed columns', function () {
      const result = util.buildBindsFromNamed(
        [{ name: 'password', rawValue: 'secret' }],
        ['username']
      );
      expect(result).to.equal(null);
    });

    it('includes only allowed columns', function () {
      const result = util.buildBindsFromNamed(
        [
          { name: 'username', rawValue: 'john' },
          { name: 'password', rawValue: 'secret' }
        ],
        ['username']
      );
      expect(result).to.deep.equal([{ name: 'username', value: 'john' }]);
    });

    it('normalizes values', function () {
      const result = util.buildBindsFromNamed(
        [{ name: 'data', rawValue: null }],
        ['data']
      );
      expect(result).to.deep.equal([{ name: 'data', value: 'null' }]);
    });

    it('caps at 100 entries', function () {
      const entries = Array.from({ length: 110 }, (_, i) => ({ name: 'col', rawValue: i }));
      const result = util.buildBindsFromNamed(entries, ['col']);
      expect(result).to.have.length(100);
    });
  });

  // ---------------------------------------------------------------------------
  // buildBindsFromPositional
  // ---------------------------------------------------------------------------
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
      const result = util.buildBindsFromPositional(
        ['john', 'secret'],
        ['username', 'password'],
        ['username']
      );
      expect(result).to.deep.equal([{ name: 'username', value: 'john' }]);
    });

    it('caps at 100 entries', function () {
      const values = Array.from({ length: 110 }, (_, i) => i);
      const colNames = Array.from({ length: 110 }, () => 'col');
      const result = util.buildBindsFromPositional(values, colNames, ['col']);
      expect(result).to.have.length(100);
    });
  });

  // ---------------------------------------------------------------------------
  // resolveColumnNamesDollarParams  (PostgreSQL $1, $2, ...)
  // ---------------------------------------------------------------------------
  describe('resolveColumnNamesDollarParams', function () {
    it('resolves a single equality condition', function () {
      const r = util.resolveColumnNamesDollarParams('SELECT * FROM t WHERE id = $1', 1);
      expect(r[0]).to.equal('id');
    });

    it('resolves multiple conditions', function () {
      const r = util.resolveColumnNamesDollarParams(
        'SELECT * FROM t WHERE username = $1 AND password = $2',
        2
      );
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('password');
    });

    it('resolves table-qualified column names', function () {
      const r = util.resolveColumnNamesDollarParams(
        'SELECT * FROM orders WHERE orders.user_id = $1',
        1
      );
      expect(r[0]).to.equal('orders.user_id');
    });

    it('resolves comparison operators other than =', function () {
      const r = util.resolveColumnNamesDollarParams(
        'SELECT * FROM t WHERE age >= $1 AND score < $2',
        2
      );
      expect(r[0]).to.equal('age');
      expect(r[1]).to.equal('score');
    });

    it('resolves LIKE and ILIKE operators', function () {
      const r = util.resolveColumnNamesDollarParams(
        'SELECT * FROM t WHERE name LIKE $1 AND bio ILIKE $2',
        2
      );
      expect(r[0]).to.equal('name');
      expect(r[1]).to.equal('bio');
    });

    it('leaves INSERT VALUES positions as undefined', function () {
      const r = util.resolveColumnNamesDollarParams(
        'INSERT INTO users (username, email) VALUES ($1, $2)',
        2
      );
      expect(r[0]).to.equal(undefined);
      expect(r[1]).to.equal(undefined);
    });

    it('resolves UPDATE SET conditions', function () {
      const r = util.resolveColumnNamesDollarParams(
        'UPDATE users SET username = $1, email = $2 WHERE id = $3',
        3
      );
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('email');
      expect(r[2]).to.equal('id');
    });
  });

  // ---------------------------------------------------------------------------
  // resolveColumnNamesQuestionMarkParams  (MySQL/MSSQL ?)
  // ---------------------------------------------------------------------------
  describe('resolveColumnNamesQuestionMarkParams', function () {
    it('resolves a single condition', function () {
      const r = util.resolveColumnNamesQuestionMarkParams('SELECT * FROM t WHERE id = ?', 1);
      expect(r[0]).to.equal('id');
    });

    it('resolves multiple conditions in order', function () {
      const r = util.resolveColumnNamesQuestionMarkParams(
        'SELECT * FROM t WHERE username = ? AND age > ?',
        2
      );
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('age');
    });

    it('resolves table-qualified column names', function () {
      const r = util.resolveColumnNamesQuestionMarkParams(
        'SELECT * FROM orders WHERE orders.user_id = ?',
        1
      );
      expect(r[0]).to.equal('orders.user_id');
    });

    it('leaves INSERT VALUES positions as undefined', function () {
      const r = util.resolveColumnNamesQuestionMarkParams(
        'INSERT INTO users (username, email) VALUES (?, ?)',
        2
      );
      expect(r[0]).to.equal(undefined);
      expect(r[1]).to.equal(undefined);
    });

    it('stops at paramCount even if more matches exist', function () {
      const r = util.resolveColumnNamesQuestionMarkParams(
        'SELECT * FROM t WHERE a = ? AND b = ? AND c = ?',
        2
      );
      expect(r).to.have.length(2);
      expect(r[0]).to.equal('a');
      expect(r[1]).to.equal('b');
    });
  });
});
