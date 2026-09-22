/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const MAX_BINDS = 100;

/**
 * @typedef {{ name: string, value: string | string[] }} BindEntry
 */

/**
 * Determines whether bind variable capture is active for the given config.
 *
 * @param {import('../config').InstanaConfig['tracing']['dbBindVariables']} cfg
 * @returns {boolean}
 */
exports.isActive = function isActive(cfg) {
  return !!(cfg && cfg.disable === false && cfg.allowedColumns && cfg.allowedColumns.length > 0);
};

/**
 * Checks whether a column name is permitted by the allowed-columns list.
 *
 * Matching rules (per spec):
 * - An **unqualified** entry (e.g. `user_id`) matches the bare column name AND any
 *   qualified form whose unqualified part matches (e.g. `orders.user_id`, `o.user_id`).
 * - A **fully qualified** entry (e.g. `orders.user_id`) matches only the exact
 *   qualified form; it does NOT match a bare `user_id`.
 *
 * @param {string} colName - column name as it appears in the query (may be qualified)
 * @param {string[]} allowedColumns
 * @returns {boolean}
 */
exports.isColumnAllowed = function isColumnAllowed(colName, allowedColumns) {
  const col = colName.toLowerCase();
  const dotIndex = col.lastIndexOf('.');
  const unqualifiedCol = dotIndex >= 0 ? col.slice(dotIndex + 1) : col;

  for (let i = 0; i < allowedColumns.length; i++) {
    const entry = allowedColumns[i].toLowerCase();
    if (entry.includes('.')) {
      // qualified entry: exact match only
      if (col === entry) return true;
    } else {
      // unqualified entry: matches bare name or any qualified form's tail
      // eslint-disable-next-line no-lonely-if
      if (unqualifiedCol === entry) return true;
    }
  }
  return false;
};

/**
 * Normalises a single raw bind value to its string representation.
 *
 * - `null` / `undefined` → `"null"`
 * - `Buffer`             → `"<binary>"`
 * - plain `object`       → `"<unsupported>"`
 * - everything else      → `String(value)`
 *
 * @param {any} rawValue
 * @returns {string}
 */
exports.normalizeValue = function normalizeValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return 'null';
  if (Buffer.isBuffer(rawValue)) return '<binary>';
  if (typeof rawValue === 'object') return '<unsupported>';
  return String(rawValue);
};

/**
 * Builds the `binds` array from a map of `{ colName → rawValue }` entries,
 * applying the allowed-columns filter and the 100-entry cap.
 *
 * Use this when the driver already provides column names (named parameters,
 * or when metadata is available from a prepared statement).
 *
 * @param {Array<{ name: string, rawValue: any }>} namedBinds
 * @param {string[]} allowedColumns
 * @returns {BindEntry[] | null}
 */
exports.buildBindsFromNamed = function buildBindsFromNamed(namedBinds, allowedColumns) {
  const binds = [];
  for (let i = 0; i < namedBinds.length; i++) {
    const { name, rawValue } = namedBinds[i];
    if (!exports.isColumnAllowed(name, allowedColumns)) continue;
    binds.push({ name, value: exports.normalizeValue(rawValue) });
    if (binds.length >= MAX_BINDS) break;
  }
  return binds.length > 0 ? binds : null;
};

/**
 * Builds the `binds` array from a positional values array, using SQL parsing
 * to resolve `$N` / `?` placeholders to column names.
 *
 * Values whose placeholder cannot be resolved to a column name in the
 * allowed-columns are silently ignored, per spec rule 5.
 *
 * @param {any[]} positionalValues  - raw values array from the driver
 * @param {string[]} columnNames    - sparse array from resolveColumnNames*; index = param index
 * @param {string[]} allowedColumns
 * @returns {BindEntry[] | null}
 */
exports.buildBindsFromPositional = function buildBindsFromPositional(positionalValues, columnNames, allowedColumns) {
  const binds = [];
  for (let i = 0; i < positionalValues.length; i++) {
    const colName = columnNames[i];
    if (!colName) continue; // spec: ignore unresolvable positional params
    if (!exports.isColumnAllowed(colName, allowedColumns)) continue;
    binds.push({ name: colName, value: exports.normalizeValue(positionalValues[i]) });
    if (binds.length >= MAX_BINDS) break;
  }
  return binds.length > 0 ? binds : null;
};

/**
 * Parses a SQL statement to resolve PostgreSQL-style positional parameters
 * (`$1`, `$2`, …) to column names via simple pattern matching.
 *
 * Recognised patterns:  `<col> <op> $N`  where op ∈ =, !=, <>, <=, >=, <, >, LIKE, ILIKE
 *
 * Returns a sparse array where index `i` holds the column name for `$(i+1)`.
 * Unresolvable positions are left `undefined` — callers must skip them.
 *
 * @param {string} sql
 * @param {number} paramCount
 * @returns {(string | undefined)[]}
 */
exports.resolveColumnNamesDollarParams = function resolveColumnNamesDollarParams(sql, paramCount) {
  const result = new Array(paramCount);
  const re = /([\w.]+)\s*(?:=|!=|<>|<=|>=|<|>|LIKE|ILIKE)\s*\$(\d+)/gi;
  for (let match = re.exec(sql); match !== null; match = re.exec(sql)) {
    const idx = parseInt(match[2], 10) - 1; // $1 → index 0
    if (idx >= 0 && idx < paramCount) {
      result[idx] = match[1];
    }
  }
  return result;
};

/**
 * Parses a SQL statement to resolve MySQL/MSSQL-style positional parameters
 * (`?`) to column names via simple pattern matching.
 *
 * Recognised patterns:  `<col> <op> ?`  where op ∈ =, !=, <>, <=, >=, <, >, LIKE
 *
 * Returns a sparse array in occurrence order.
 * Unresolvable positions are left `undefined` — callers must skip them.
 *
 * @param {string} sql
 * @param {number} paramCount
 * @returns {(string | undefined)[]}
 */
exports.resolveColumnNamesQuestionMarkParams = function resolveColumnNamesQuestionMarkParams(sql, paramCount) {
  const result = new Array(paramCount);
  const re = /([\w.]+)\s*(?:=|!=|<>|<=|>=|<|>|LIKE|ILIKE)\s*\?/gi;
  let idx = 0;
  for (let match = re.exec(sql); match !== null && idx < paramCount; match = re.exec(sql)) {
    result[idx++] = match[1];
  }
  return result;
};
