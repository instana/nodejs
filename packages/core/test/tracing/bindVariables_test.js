/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');
const util = require('../../src/util/bindVariables');

describe('tracing.bindVariables', function () {
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

  describe('normalizeBindValue', function () {
    it('converts null to "null"', function () {
      expect(util.normalizeBindValue(null)).to.equal('null');
    });

    it('converts undefined to "null"', function () {
      expect(util.normalizeBindValue(undefined)).to.equal('null');
    });

    it('converts Buffer to "<binary>"', function () {
      expect(util.normalizeBindValue(Buffer.from('data'))).to.equal('<binary>');
    });

    it('converts plain object to JSON string', function () {
      expect(util.normalizeBindValue({ foo: 'bar' })).to.equal('{"foo":"bar"}');
    });

    it('converts array to JSON string', function () {
      expect(util.normalizeBindValue([1, 2, 3])).to.equal('[1,2,3]');
    });

    it('converts circular object to "<unsupported>"', function () {
      const circular = {};
      circular.self = circular;
      expect(util.normalizeBindValue(circular)).to.equal('<unsupported>');
    });

    it('converts number to string', function () {
      expect(util.normalizeBindValue(42)).to.equal('42');
    });

    it('converts boolean to string', function () {
      expect(util.normalizeBindValue(true)).to.equal('true');
    });

    it('passes strings through', function () {
      expect(util.normalizeBindValue('hello')).to.equal('hello');
    });
  });

  describe('buildPositionalBinds', function () {
    it('returns null when no column names can be resolved', function () {
      const result = util.buildPositionalBinds([42, 'secret'], [undefined, undefined], ['id']);
      expect(result).to.equal(null);
    });

    it('skips unresolvable positions', function () {
      // $1 → id, $2 → unresolvable
      const result = util.buildPositionalBinds([42, 'secret'], ['id', undefined], ['id']);
      expect(result).to.deep.equal([{ name: 'id', value: '42' }]);
    });

    it('skips columns not in allowedColumns', function () {
      const result = util.buildPositionalBinds(['john', 'secret'], ['username', 'password'], ['username']);
      expect(result).to.deep.equal([{ name: 'username', value: 'john' }]);
    });

    it('caps at 100 entries', function () {
      const values = Array.from({ length: 110 }, (_, i) => i);
      const colNames = Array.from({ length: 110 }, () => 'col');
      const result = util.buildPositionalBinds(values, colNames, ['col']);
      expect(result).to.have.length(100);
    });
  });

  describe('resolveDollarParamColumns', function () {
    it('resolves a single equality condition', function () {
      const r = util.resolveDollarParamColumns('SELECT * FROM t WHERE id = $1', 1);
      expect(r[0]).to.equal('id');
    });

    it('resolves multiple conditions', function () {
      const r = util.resolveDollarParamColumns('SELECT * FROM t WHERE username = $1 AND password = $2', 2);
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('password');
    });

    it('resolves table-qualified column names', function () {
      const r = util.resolveDollarParamColumns('SELECT * FROM orders WHERE orders.user_id = $1', 1);
      expect(r[0]).to.equal('orders.user_id');
    });

    it('resolves comparison operators other than =', function () {
      const r = util.resolveDollarParamColumns('SELECT * FROM t WHERE age >= $1 AND score < $2', 2);
      expect(r[0]).to.equal('age');
      expect(r[1]).to.equal('score');
    });

    it('resolves LIKE and ILIKE operators', function () {
      const r = util.resolveDollarParamColumns('SELECT * FROM t WHERE name LIKE $1 AND bio ILIKE $2', 2);
      expect(r[0]).to.equal('name');
      expect(r[1]).to.equal('bio');
    });

    it('resolves INSERT VALUES positions from column list', function () {
      const r = util.resolveDollarParamColumns('INSERT INTO users (username, email) VALUES ($1, $2)', 2);
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('email');
    });

    it('resolves UPDATE SET conditions', function () {
      const r = util.resolveDollarParamColumns('UPDATE users SET username = $1, email = $2 WHERE id = $3', 3);
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('email');
      expect(r[2]).to.equal('id');
    });

    it('resolves DELETE WHERE conditions', function () {
      const r = util.resolveDollarParamColumns('DELETE FROM users WHERE name = $1 AND email = $2', 2);
      expect(r[0]).to.equal('name');
      expect(r[1]).to.equal('email');
    });

    it('resolves IN-collection positions — tagged with inGroup', function () {
      const r = util.resolveDollarParamColumns('SELECT * FROM users WHERE name IN ($1, $2, $3)', 3);
      expect(r[0]).to.deep.equal({ col: 'name', inGroup: 0 });
      expect(r[1]).to.deep.equal({ col: 'name', inGroup: 0 });
      expect(r[2]).to.deep.equal({ col: 'name', inGroup: 0 });
    });

    it('resolves IN-collection alongside a WHERE equality in the same query', function () {
      const r = util.resolveDollarParamColumns('SELECT * FROM users WHERE status = $1 AND name IN ($2, $3)', 3);
      expect(r[0]).to.equal('status');
      expect(r[1]).to.deep.equal({ col: 'name', inGroup: 0 });
      expect(r[2]).to.deep.equal({ col: 'name', inGroup: 0 });
    });

    it('resolves qualified column IN-collection', function () {
      const r = util.resolveDollarParamColumns('SELECT * FROM users WHERE users.name IN ($1, $2)', 2);
      expect(r[0]).to.deep.equal({ col: 'users.name', inGroup: 0 });
      expect(r[1]).to.deep.equal({ col: 'users.name', inGroup: 0 });
    });
  });

  describe('resolveQuestionParamColumns', function () {
    it('resolves a single equality condition', function () {
      const r = util.resolveQuestionParamColumns('SELECT * FROM t WHERE id = ?', 1);
      expect(r[0]).to.equal('id');
    });

    it('resolves multiple conditions in left-to-right order', function () {
      const r = util.resolveQuestionParamColumns('SELECT * FROM t WHERE username = ? AND password = ?', 2);
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('password');
    });

    it('resolves table-qualified column names', function () {
      const r = util.resolveQuestionParamColumns('SELECT * FROM orders WHERE orders.user_id = ?', 1);
      expect(r[0]).to.equal('orders.user_id');
    });

    it('resolves comparison operators other than =', function () {
      const r = util.resolveQuestionParamColumns('SELECT * FROM t WHERE age >= ? AND score < ?', 2);
      expect(r[0]).to.equal('age');
      expect(r[1]).to.equal('score');
    });

    it('resolves LIKE and ILIKE operators', function () {
      const r = util.resolveQuestionParamColumns('SELECT * FROM t WHERE name LIKE ? AND bio ILIKE ?', 2);
      expect(r[0]).to.equal('name');
      expect(r[1]).to.equal('bio');
    });

    it('resolves INSERT VALUES positions from column list', function () {
      const r = util.resolveQuestionParamColumns('INSERT INTO users (username, email) VALUES (?, ?)', 2);
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('email');
    });

    it('resolves UPDATE SET conditions', function () {
      const r = util.resolveQuestionParamColumns('UPDATE users SET username = ?, email = ? WHERE id = ?', 3);
      expect(r[0]).to.equal('username');
      expect(r[1]).to.equal('email');
      expect(r[2]).to.equal('id');
    });

    it('resolves DELETE WHERE conditions', function () {
      const r = util.resolveQuestionParamColumns('DELETE FROM users WHERE name = ? AND email = ?', 2);
      expect(r[0]).to.equal('name');
      expect(r[1]).to.equal('email');
    });

    it('stops collecting once paramCount is reached', function () {
      // sql has 3 ? but we only ask for 2
      const r = util.resolveQuestionParamColumns('SELECT * FROM t WHERE a = ? AND b = ? AND c = ?', 2);
      expect(r[0]).to.equal('a');
      expect(r[1]).to.equal('b');
      expect(r[2]).to.equal(undefined);
    });

    it('resolves IN-collection positions — tagged with inGroup', function () {
      const r = util.resolveQuestionParamColumns('SELECT * FROM users WHERE name IN (?, ?, ?)', 3);
      expect(r[0]).to.deep.equal({ col: 'name', inGroup: 0 });
      expect(r[1]).to.deep.equal({ col: 'name', inGroup: 0 });
      expect(r[2]).to.deep.equal({ col: 'name', inGroup: 0 });
    });

    it('resolves IN-collection alongside a WHERE equality in the same query', function () {
      const r = util.resolveQuestionParamColumns('SELECT * FROM users WHERE status = ? AND name IN (?, ?)', 3);
      expect(r[0]).to.equal('status');
      expect(r[1]).to.deep.equal({ col: 'name', inGroup: 0 });
      expect(r[2]).to.deep.equal({ col: 'name', inGroup: 0 });
    });

    it('resolves IN-collection followed by ORDER BY LIMIT (LIMIT ? has no column context)', function () {
      const r = util.resolveQuestionParamColumns(
        'SELECT * FROM users WHERE name IN (?, ?) ORDER BY email ASC LIMIT ?',
        3
      );
      expect(r[0]).to.deep.equal({ col: 'name', inGroup: 0 });
      expect(r[1]).to.deep.equal({ col: 'name', inGroup: 0 });
      expect(r[2]).to.equal(undefined);
    });

    it('resolves WHERE equality before IN-collection', function () {
      const r = util.resolveQuestionParamColumns('SELECT * FROM users WHERE email = ? AND name IN (?, ?)', 3);
      expect(r[0]).to.equal('email');
      expect(r[1]).to.deep.equal({ col: 'name', inGroup: 0 });
      expect(r[2]).to.deep.equal({ col: 'name', inGroup: 0 });
    });
  });

  describe('resolveNamedParamColumns', function () {
    it('resolves a single :name equality condition', function () {
      const r = util.resolveNamedParamColumns('SELECT * FROM t WHERE id = :id');
      expect(r).to.deep.equal([{ col: 'id', key: 'id' }]);
    });

    it('resolves multiple named conditions in left-to-right order', function () {
      const r = util.resolveNamedParamColumns('SELECT * FROM t WHERE name = :name AND age > :age');
      expect(r).to.deep.equal([
        { col: 'name', key: 'name' },
        { col: 'age', key: 'age' }
      ]);
    });

    it('resolves table-qualified column names', function () {
      const r = util.resolveNamedParamColumns('SELECT * FROM orders WHERE orders.user_id = :userId');
      expect(r).to.deep.equal([{ col: 'orders.user_id', key: 'userId' }]);
    });

    it('resolves comparison operators other than =', function () {
      const r = util.resolveNamedParamColumns('SELECT * FROM t WHERE age >= :minAge AND score < :maxScore');
      expect(r).to.deep.equal([
        { col: 'age', key: 'minAge' },
        { col: 'score', key: 'maxScore' }
      ]);
    });

    it('resolves LIKE operator', function () {
      const r = util.resolveNamedParamColumns('SELECT * FROM t WHERE name LIKE :namePattern');
      expect(r).to.deep.equal([{ col: 'name', key: 'namePattern' }]);
    });

    it('resolves INSERT column-list positions', function () {
      const r = util.resolveNamedParamColumns('INSERT INTO users (name, email) VALUES (:name, :email)');
      expect(r).to.deep.equal([
        { col: 'name', key: 'name' },
        { col: 'email', key: 'email' }
      ]);
    });

    it('resolves INSERT when param key differs from column name', function () {
      const r = util.resolveNamedParamColumns('INSERT INTO users (name, email) VALUES (:n, :e)');
      expect(r).to.deep.equal([
        { col: 'name', key: 'n' },
        { col: 'email', key: 'e' }
      ]);
    });

    it('resolves UPDATE SET conditions', function () {
      const r = util.resolveNamedParamColumns('UPDATE users SET name = :name, email = :email WHERE id = :id');
      expect(r).to.deep.equal([
        { col: 'name', key: 'name' },
        { col: 'email', key: 'email' },
        { col: 'id', key: 'id' }
      ]);
    });

    it('resolves DELETE WHERE conditions', function () {
      const r = util.resolveNamedParamColumns('DELETE FROM users WHERE name = :name AND email = :email');
      expect(r).to.deep.equal([
        { col: 'name', key: 'name' },
        { col: 'email', key: 'email' }
      ]);
    });

    it('returns empty array when no named placeholders present', function () {
      const r = util.resolveNamedParamColumns('SELECT * FROM t WHERE id = ?');
      expect(r).to.deep.equal([]);
    });

    it('resolves IN-collection with named placeholders — tagged with inGroup', function () {
      const r = util.resolveNamedParamColumns('SELECT * FROM users WHERE name IN (:n1, :n2, :n3)');
      expect(r).to.deep.equal([
        { col: 'name', key: 'n1', inGroup: 0 },
        { col: 'name', key: 'n2', inGroup: 0 },
        { col: 'name', key: 'n3', inGroup: 0 }
      ]);
    });

    it('resolves IN-collection alongside a WHERE equality with named placeholders', function () {
      const r = util.resolveNamedParamColumns('SELECT * FROM users WHERE status = :status AND name IN (:n1, :n2)');
      expect(r).to.deep.equal([
        { col: 'status', key: 'status' },
        { col: 'name', key: 'n1', inGroup: 0 },
        { col: 'name', key: 'n2', inGroup: 0 }
      ]);
    });

    it('resolves qualified column IN-collection with named placeholders', function () {
      const r = util.resolveNamedParamColumns('SELECT * FROM users WHERE users.name IN (:a, :b)');
      expect(r).to.deep.equal([
        { col: 'users.name', key: 'a', inGroup: 0 },
        { col: 'users.name', key: 'b', inGroup: 0 }
      ]);
    });
  });

  describe('buildBindsFromNamed', function () {
    it('maps param names to column names and values', function () {
      const r = util.buildBindsFromNamed(
        'SELECT * FROM users WHERE name = :name AND age > :age',
        { name: 'alice', age: 30 },
        ['name', 'age']
      );
      expect(r).to.deep.equal([
        { name: 'name', value: 'alice' },
        { name: 'age', value: '30' }
      ]);
    });

    it('applies allowed-columns filter', function () {
      const r = util.buildBindsFromNamed(
        'SELECT * FROM users WHERE name = :name AND email = :email',
        { name: 'alice', email: 'alice@example.com' },
        ['name']
      );
      expect(r).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('skips param when key is absent from values object', function () {
      const r = util.buildBindsFromNamed('SELECT * FROM t WHERE name = :name AND age > :age', { name: 'alice' }, [
        'name',
        'age'
      ]);
      expect(r).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('resolves INSERT column-list', function () {
      const r = util.buildBindsFromNamed(
        'INSERT INTO users (name, email) VALUES (:name, :email)',
        { name: 'alice', email: 'alice@example.com' },
        ['name', 'email']
      );
      expect(r).to.deep.equal([
        { name: 'name', value: 'alice' },
        { name: 'email', value: 'alice@example.com' }
      ]);
    });

    it('returns null when values object is empty', function () {
      const r = util.buildBindsFromNamed('SELECT * FROM t WHERE name = :name', {}, ['name']);
      expect(r).to.equal(null);
    });

    it('IN collection groups all values into a single JSON-array entry', function () {
      const r = util.buildBindsFromNamed(
        'SELECT * FROM users WHERE name IN (:n1, :n2, :n3)',
        { n1: 'alice', n2: 'bob', n3: 'carol' },
        ['name']
      );
      expect(r).to.deep.equal([{ name: 'name', value: '["alice","bob","carol"]' }]);
    });

    it('IN collection alongside equality — grouped entry plus individual entry', function () {
      const r = util.buildBindsFromNamed(
        'SELECT * FROM users WHERE status = :status AND name IN (:n1, :n2)',
        { status: 'active', n1: 'alice', n2: 'bob' },
        ['name', 'status']
      );
      expect(r).to.deep.equal([
        { name: 'status', value: 'active' },
        { name: 'name', value: '["alice","bob"]' }
      ]);
    });
  });

  describe('buildBinds', function () {
    const allowedColumns = ['name'];

    it('extracts values from positional array', function () {
      const sql = 'SELECT * FROM users WHERE name = $1';
      const result = util.buildBinds({ sql, rawValues: ['alice'], allowedColumns });
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('returns null when rawValues is null, undefined, or empty', function () {
      const sql = 'SELECT * FROM users WHERE name = $1';
      expect(util.buildBinds({ sql, rawValues: null, allowedColumns })).to.equal(null);
      expect(util.buildBinds({ sql, rawValues: undefined, allowedColumns })).to.equal(null);
      expect(util.buildBinds({ sql, rawValues: [], allowedColumns })).to.equal(null);
    });

    it('returns null when sql is null or empty', function () {
      expect(util.buildBinds({ sql: null, rawValues: ['alice'], allowedColumns })).to.equal(null);
      expect(util.buildBinds({ sql: '', rawValues: ['alice'], allowedColumns })).to.equal(null);
    });

    it('applies allowed-columns filter', function () {
      const sql = 'SELECT * FROM users WHERE name = $1 AND email = $2';
      const result = util.buildBinds({ sql, rawValues: ['alice', 'alice@example.com'], allowedColumns });
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('resolves INSERT column-list (dollar)', function () {
      const sql = 'INSERT INTO users (name, email) VALUES ($1, $2)';
      const result = util.buildBinds({ sql, rawValues: ['alice', 'alice@example.com'], allowedColumns });
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('resolves INSERT column-list (question)', function () {
      const sql = 'INSERT INTO users (name, email) VALUES (?, ?)';
      const result = util.buildBinds({
        sql,
        rawValues: ['alice', 'alice@example.com'],
        allowedColumns,
        parameterStyle: 'question'
      });
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('resolves INSERT column-list (named)', function () {
      const sql = 'INSERT INTO users (name, email) VALUES (:name, :email)';
      const result = util.buildBinds({
        sql,
        rawValues: { name: 'alice', email: 'alice@example.com' },
        allowedColumns,
        parameterStyle: 'named'
      });
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('resolves DELETE WHERE conditions', function () {
      const sql = 'DELETE FROM users WHERE name = $1 AND email = $2';
      const result = util.buildBinds({ sql, rawValues: ['deleteuser', 'delete@example.com'], allowedColumns });
      expect(result).to.deep.equal([{ name: 'name', value: 'deleteuser' }]);
    });

    it('uses dollar resolver by default', function () {
      const sql = 'SELECT * FROM users WHERE name = $1';
      const result = util.buildBinds({ sql, rawValues: ['alice'], allowedColumns });
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('uses question resolver when parameterStyle is "question"', function () {
      const sql = 'SELECT * FROM users WHERE name = ?';
      const result = util.buildBinds({ sql, rawValues: ['alice'], allowedColumns, parameterStyle: 'question' });
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('applies allowed-columns filter with question style', function () {
      const sql = 'SELECT * FROM users WHERE name = ? AND email = ?';
      const result = util.buildBinds({
        sql,
        rawValues: ['alice', 'alice@example.com'],
        allowedColumns,
        parameterStyle: 'question'
      });
      expect(result).to.deep.equal([{ name: 'name', value: 'alice' }]);
    });

    it('IN collection (dollar) groups all values into a single JSON-array entry', function () {
      const sql = 'SELECT * FROM users WHERE name IN ($1, $2, $3)';
      const result = util.buildBinds({ sql, rawValues: ['alice', 'bob', 'carol'], allowedColumns });
      expect(result).to.deep.equal([{ name: 'name', value: '["alice","bob","carol"]' }]);
    });

    it('IN collection (question) groups all values into a single JSON-array entry', function () {
      const sql = 'SELECT * FROM users WHERE name IN (?, ?, ?)';
      const result = util.buildBinds({
        sql,
        rawValues: ['alice', 'bob', 'carol'],
        allowedColumns,
        parameterStyle: 'question'
      });
      expect(result).to.deep.equal([{ name: 'name', value: '["alice","bob","carol"]' }]);
    });

    it('IN collection alongside equality — grouped entry plus individual entry', function () {
      const sql = 'SELECT * FROM users WHERE status = $1 AND name IN ($2, $3)';
      const result = util.buildBinds({
        sql,
        rawValues: ['active', 'alice', 'bob'],
        allowedColumns: ['name', 'status']
      });
      expect(result).to.deep.equal([
        { name: 'status', value: 'active' },
        { name: 'name', value: '["alice","bob"]' }
      ]);
    });
  });

  describe('ANY — full pipeline', function () {
    it('dollar: array value serialised as JSON', function () {
      const result = util.buildBinds({
        sql: 'SELECT * FROM users WHERE name = ANY($1)',
        rawValues: [['alice', 'bob', 'carol']],
        allowedColumns: ['name']
      });
      expect(result).to.deep.equal([{ name: 'name', value: '["alice","bob","carol"]' }]);
    });

    it('question: array value serialised as JSON', function () {
      const result = util.buildBinds({
        sql: 'SELECT * FROM users WHERE name = ANY(?)',
        rawValues: [['alice', 'bob', 'carol']],
        allowedColumns: ['name'],
        parameterStyle: 'question'
      });
      expect(result).to.deep.equal([{ name: 'name', value: '["alice","bob","carol"]' }]);
    });

    it('named: array value serialised as JSON', function () {
      const result = util.buildBinds({
        sql: 'SELECT * FROM users WHERE name = ANY(:names)',
        rawValues: { names: ['alice', 'bob', 'carol'] },
        allowedColumns: ['name'],
        parameterStyle: 'named'
      });
      expect(result).to.deep.equal([{ name: 'name', value: '["alice","bob","carol"]' }]);
    });

    it('dollar: ANY alongside a WHERE equality — both captured', function () {
      const result = util.buildBinds({
        sql: 'SELECT * FROM users WHERE status = $1 AND name = ANY($2)',
        rawValues: ['active', ['alice', 'bob']],
        allowedColumns: ['name', 'status']
      });
      expect(result).to.deep.equal([
        { name: 'status', value: 'active' },
        { name: 'name', value: '["alice","bob"]' }
      ]);
    });

    it('dollar: != ANY operator variant is captured', function () {
      const result = util.buildBinds({
        sql: 'SELECT * FROM users WHERE name != ANY($1)',
        rawValues: [['alice', 'bob']],
        allowedColumns: ['name']
      });
      expect(result).to.deep.equal([{ name: 'name', value: '["alice","bob"]' }]);
    });

    it('dollar: qualified column ANY is captured', function () {
      const result = util.buildBinds({
        sql: 'SELECT * FROM users WHERE users.name = ANY($1)',
        rawValues: [['alice', 'bob']],
        allowedColumns: ['name']
      });
      expect(result).to.deep.equal([{ name: 'users.name', value: '["alice","bob"]' }]);
    });

    it('dollar: allowed-columns filter applies — column not in list returns null', function () {
      const result = util.buildBinds({
        sql: 'SELECT * FROM users WHERE email = ANY($1)',
        rawValues: [['a@x.com', 'b@x.com']],
        allowedColumns: ['name']
      });
      expect(result).to.equal(null);
    });

    it('dollar: null element inside array is serialised as JSON null', function () {
      const result = util.buildBinds({
        sql: 'SELECT * FROM users WHERE name = ANY($1)',
        rawValues: [[null, 'alice']],
        allowedColumns: ['name']
      });
      expect(result).to.deep.equal([{ name: 'name', value: '[null,"alice"]' }]);
    });
  });
});
