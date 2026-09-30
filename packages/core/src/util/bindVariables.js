/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { MAX_BINDS } = require('../tracing/constants');

const OPERATOR_GROUP_REGEX = '(?:=|!=|<>|<=|>=|<|>|LIKE|ILIKE)';
const DOLLAR_PARAM_REGEX = `([\\w.]+)\\s*${OPERATOR_GROUP_REGEX}\\s*\\$(\\d+)`;
const QUESTION_PARAM_REGEX = `([\\w.]+)\\s*${OPERATOR_GROUP_REGEX}\\s*\\?`;
const NAMED_PARAM_REGEX = `([\\w.]+)\\s*${OPERATOR_GROUP_REGEX}\\s*:([a-zA-Z][a-zA-Z0-9_]*)`;
const INSERT_REGEX = /INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+)/i;

/** @typedef {{ name: string, value: string }} BindEntry */

/**
 * Unqualified entries match both bare and qualified column names.
 * Qualified entries match only the exact qualified form.
 *
 * @param {string} colName
 * @param {string[]} allowedColumns
 * @returns {boolean}
 */
exports.isColumnAllowed = function isColumnAllowed(colName, allowedColumns) {
  const col = colName.toLowerCase();
  const dotIndex = col.lastIndexOf('.');
  const unqualifiedCol = dotIndex >= 0 ? col.slice(dotIndex + 1) : col;

  for (let i = 0; i < allowedColumns.length; i++) {
    const entry = allowedColumns[i];
    if (entry.includes('.')) {
      if (col === entry) return true;
    } else if (unqualifiedCol === entry) {
      return true;
    }
  }
  return false;
};

/**
 * @param {any} rawValue
 * @returns {string}
 */
exports.normalizeBindValue = function normalizeBindValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return 'null';
  if (Buffer.isBuffer(rawValue)) return '<binary>';
  if (typeof rawValue === 'object') {
    try {
      return JSON.stringify(rawValue);
    } catch (_) {
      return '<unsupported>';
    }
  }
  return String(rawValue);
};

/**
 * @param {any[]} positionalValues
 * @param {string[]} columnNames
 * @param {string[]} allowedColumns
 * @returns {BindEntry[] | null}
 */
exports.buildPositionalBinds = function buildPositionalBinds(positionalValues, columnNames, allowedColumns) {
  const binds = [];
  for (let i = 0; i < positionalValues.length; i++) {
    const colName = columnNames[i];
    if (!colName) continue;
    if (!exports.isColumnAllowed(colName, allowedColumns)) continue;
    binds.push({ name: colName, value: exports.normalizeBindValue(positionalValues[i]) });
    if (binds.length >= MAX_BINDS) break;
  }
  return binds.length > 0 ? binds : null;
};

/**
 * Maps columns to matched placeholder tokens in an INSERT's VALUES clause
 *
 * @param {string} sql
 * @param {RegExp} tokenRe
 * @param {(col: string, token: RegExpExecArray) => void} applyToken
 */
function applyInsertMappings(sql, tokenRe, applyToken) {
  const m = INSERT_REGEX.exec(sql);
  if (!m) return;
  const cols = m[1]
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
  const valuesClause = m[2];
  tokenRe.lastIndex = 0;
  let i = 0;
  for (let tok = tokenRe.exec(valuesClause); tok !== null && i < cols.length; tok = tokenRe.exec(valuesClause)) {
    applyToken(cols[i++], tok);
  }
}

/**
 * Resolves PostgreSQL-style `$N` placeholders to column names.
 * Handles `<col> <op> $N` patterns (WHERE/SET) and INSERT column-list correlation.
 * Returns a sparse array indexed by param position (0-based).
 *
 * @param {string} sql
 * @param {number} paramCount
 * @returns {(string | undefined)[]}
 */
exports.resolveDollarParamColumns = function resolveDollarParamColumns(sql, paramCount) {
  const result = new Array(paramCount);
  const re = new RegExp(DOLLAR_PARAM_REGEX, 'gi');
  for (let match = re.exec(sql); match !== null; match = re.exec(sql)) {
    const idx = parseInt(match[2], 10) - 1;
    if (idx >= 0 && idx < paramCount) {
      result[idx] = match[1];
    }
  }

  applyInsertMappings(sql, /\$(\d+)/g, (col, tok) => {
    const idx = parseInt(tok[1], 10) - 1;
    if (idx >= 0 && idx < paramCount) {
      result[idx] = result[idx] || col;
    }
  });

  return result;
};

/**
 * Resolves JDBC-style `?` placeholders to column names.
 * Handles `<col> <op> ?` patterns (WHERE/SET) and INSERT column-list correlation.
 * Returns a sparse array indexed by param position (0-based), in left-to-right order.
 *
 * @param {string} sql
 * @param {number} paramCount
 * @returns {(string | undefined)[]}
 */
exports.resolveQuestionParamColumns = function resolveQuestionParamColumns(sql, paramCount) {
  const result = new Array(paramCount);
  const re = new RegExp(QUESTION_PARAM_REGEX, 'gi');
  let pos = 0;

  for (let match = re.exec(sql); match !== null && pos < paramCount; match = re.exec(sql)) {
    result[pos++] = match[1];
  }

  applyInsertMappings(sql, /\?/g, col => {
    if (pos < paramCount) result[pos++] = col;
  });

  return result;
};

/**
 * Resolves mysql2 named placeholders (`:paramName`) to `{ col, key }` pairs.
 * Handles `<col> <op> :paramName` patterns (WHERE/SET) and INSERT column-list correlation.
 * Returns pairs in left-to-right order of appearance.
 *
 * @param {string} sql
 * @returns {{ col: string, key: string }[]}
 */
exports.resolveColumnNamesNamedParams = function resolveColumnNamesNamedParams(sql) {
  const result = [];

  const re = new RegExp(NAMED_PARAM_REGEX, 'gi');
  for (let match = re.exec(sql); match !== null; match = re.exec(sql)) {
    result.push({ col: match[1], key: match[2] });
  }

  applyInsertMappings(sql, /:([a-zA-Z][a-zA-Z0-9_]*)/g, (col, tok) => {
    result.push({ col, key: tok[1] });
  });

  return result;
};

/**
 * Builds binds from a named-parameter values object (mysql2 `namedPlaceholders: true` mode).
 * Column names are resolved from `<col> <op> :paramName` patterns in the SQL;
 * values are looked up by paramName from the object.
 *
 * @param {string} sql
 * @param {Record<string, unknown>} namedValues  e.g. { name: 'alice', age: 30 }
 * @param {string[]} allowedColumns
 * @returns {BindEntry[] | null}
 */
exports.buildBindsFromNamed = function buildBindsFromNamed(sql, namedValues, allowedColumns) {
  const pairs = exports.resolveColumnNamesNamedParams(sql);
  const binds = [];
  for (let i = 0; i < pairs.length; i++) {
    const { col, key } = pairs[i];
    if (!exports.isColumnAllowed(col, allowedColumns)) continue;
    if (!Object.prototype.hasOwnProperty.call(namedValues, key)) continue;
    binds.push({ name: col, value: exports.normalizeBindValue(namedValues[key]) });
    if (binds.length >= MAX_BINDS) break;
  }
  return binds.length > 0 ? binds : null;
};

/**
 * Maps a parameterStyle name to its positional resolver function.
 * Each resolver signature: (sql: string, paramCount: number) => (string | undefined)[]
 *
 * @type {{ [style: string]: (sql: string, paramCount: number) => (string | undefined)[] }}
 */
const resolvers = {
  dollar: exports.resolveDollarParamColumns,
  question: exports.resolveQuestionParamColumns
};

/**
 * @param {{
 *   sql: string,
 *   rawValues: any[] | Record<string, unknown>,
 *   allowedColumns: string[],
 *   parameterStyle?: 'dollar' | 'question' | 'named'
 * }} opts
 * @returns {BindEntry[] | null}
 */
exports.buildBinds = function buildBinds({ sql, rawValues, allowedColumns, parameterStyle = 'dollar' }) {
  if (!sql || rawValues == null) {
    return null;
  }

  if (parameterStyle === 'named') {
    if (Array.isArray(rawValues) || typeof rawValues !== 'object') return null;
    return exports.buildBindsFromNamed(sql, rawValues, allowedColumns);
  }

  if (!Array.isArray(rawValues) || rawValues.length === 0) {
    return null;
  }

  const resolver = resolvers[parameterStyle];

  if (!resolver) {
    return null;
  }

  const columnNames = resolver(sql, rawValues.length);
  return exports.buildPositionalBinds(rawValues, columnNames, allowedColumns);
};
