/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { MAX_BINDS } = require('../tracing/constants');

const DOLLAR_PARAM_RE_SOURCE = '([\\w.]+)\\s*(?:=|!=|<>|<=|>=|<|>|LIKE|ILIKE)\\s*\\$(\\d+)';

/** @typedef {{ name: string, value: string }} BindEntry */

/**
 * Unqualified entries match both bare and qualified column names.
 * Qualified entries match only the exact qualified form.
 *
 * @param {string} colName
 * @param {string[]} allowedColumns - pre-lowercased
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
exports.normalizeValue = function normalizeValue(rawValue) {
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
exports.buildBindsFromPositional = function buildBindsFromPositional(positionalValues, columnNames, allowedColumns) {
  const binds = [];
  for (let i = 0; i < positionalValues.length; i++) {
    const colName = columnNames[i];
    if (!colName) continue;
    if (!exports.isColumnAllowed(colName, allowedColumns)) continue;
    binds.push({ name: colName, value: exports.normalizeValue(positionalValues[i]) });
    if (binds.length >= MAX_BINDS) break;
  }
  return binds.length > 0 ? binds : null;
};

/**
 * Resolves PostgreSQL `$N` placeholders to column names via `<col> <op> $N` pattern matching.
 * Returns a sparse array indexed by param position (0-based).
 *
 * @param {string} sql
 * @param {number} paramCount
 * @returns {(string | undefined)[]}
 */
exports.resolveColumnNamesDollarParams = function resolveColumnNamesDollarParams(sql, paramCount) {
  const result = new Array(paramCount);
  const re = new RegExp(DOLLAR_PARAM_RE_SOURCE, 'gi');
  for (let match = re.exec(sql); match !== null; match = re.exec(sql)) {
    const idx = parseInt(match[2], 10) - 1;
    if (idx >= 0 && idx < paramCount) {
      result[idx] = match[1];
    }
  }
  return result;
};

/**
 * @param {{ sql: string, rawValues: any[], allowedColumns: string[] }} opts - allowedColumns must be pre-lowercased
 * @returns {BindEntry[] | null}
 */
exports.buildBinds = function buildBinds({ sql, rawValues, allowedColumns }) {
  if (!sql || !Array.isArray(rawValues) || rawValues.length === 0) {
    return null;
  }

  const columnNames = exports.resolveColumnNamesDollarParams(sql, rawValues.length);
  return exports.buildBindsFromPositional(rawValues, columnNames, allowedColumns);
};
