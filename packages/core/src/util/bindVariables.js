/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { MAX_BINDS } = require('../tracing/constants');

const OPERATOR_GROUP_REGEX = '(?:=|!=|<>|<=|>=|<|>|LIKE|ILIKE)';
const DOLLAR_PARAM_REGEX = `([\\w.]+)\\s*${OPERATOR_GROUP_REGEX}\\s*(?:ANY\\s*\\(\\s*)?\\$(\\d+)(?:\\s*\\))?`;
const QUESTION_PARAM_REGEX = `([\\w.]+)\\s*${OPERATOR_GROUP_REGEX}\\s*(?:ANY\\s*\\(\\s*)?\\?(?:\\s*\\))?`;
// eslint-disable-next-line max-len
const NAMED_PARAM_REGEX = `([\\w.]+)\\s*${OPERATOR_GROUP_REGEX}\\s*(?:ANY\\s*\\(\\s*)?:([a-zA-Z][a-zA-Z0-9_]*)(?:\\s*\\))?`;
const INSERT_REGEX = /INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+)/i;
const IN_COLLECTION_REGEX = /([\w.]+)\s+IN\s*\(([^)]+)\)/gi;

/** @typedef {{ col: string, inGroup?: number }} InGroupTag */

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
 * @param {(string | InGroupTag | undefined)[] | (string | undefined)[]} columnNames
 * @param {string[]} allowedColumns
 * @returns {BindEntry[] | null}
 */
exports.buildPositionalBinds = function buildPositionalBinds(positionalValues, columnNames, allowedColumns) {
  const binds = [];
  const consumedGroups = new Set();

  for (let i = 0; i < positionalValues.length; i++) {
    const slot = columnNames[i];
    if (!slot) continue;

    // IN-group slot: collect all values that share the same inGroup into one array entry
    if (typeof slot === 'object') {
      const { col, inGroup } = slot;
      if (consumedGroups.has(inGroup)) continue;
      consumedGroups.add(inGroup);
      if (!exports.isColumnAllowed(col, allowedColumns)) continue;
      const groupValues = [];
      for (let j = i; j < columnNames.length; j++) {
        const s = columnNames[j];
        if (typeof s === 'object' && s.inGroup === inGroup) groupValues.push(positionalValues[j]);
      }
      binds.push({ name: col, value: exports.normalizeBindValue(groupValues) });
    } else {
      if (!exports.isColumnAllowed(slot, allowedColumns)) continue;
      binds.push({ name: slot, value: exports.normalizeBindValue(positionalValues[i]) });
    }

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

  let inGroup = 0;
  IN_COLLECTION_REGEX.lastIndex = 0;
  for (let m = IN_COLLECTION_REGEX.exec(sql); m !== null; m = IN_COLLECTION_REGEX.exec(sql)) {
    const col = m[1];
    const inner = m[2];
    const paramRe = /\$(\d+)/g;
    let found = false;
    for (let tok = paramRe.exec(inner); tok !== null; tok = paramRe.exec(inner)) {
      const idx = parseInt(tok[1], 10) - 1;
      if (idx >= 0 && idx < paramCount && !result[idx]) {
        result[idx] = { col, inGroup };
        found = true;
      }
    }
    if (found) inGroup++;
  }

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

  // 1a. IN collections: col IN (?, ?, ?) — tagged with inGroup so buildPositionalBinds can group them
  const colByOffset = new Map();
  let inGroup = 0;
  IN_COLLECTION_REGEX.lastIndex = 0;
  for (let m = IN_COLLECTION_REGEX.exec(sql); m !== null; m = IN_COLLECTION_REGEX.exec(sql)) {
    const col = m[1];
    const innerStart = m.index + m[0].indexOf('(') + 1;
    const qRe = /\?/g;
    let found = false;
    for (let tok = qRe.exec(m[2]); tok !== null; tok = qRe.exec(m[2])) {
      colByOffset.set(innerStart + tok.index, { col, inGroup });
      found = true;
    }
    if (found) inGroup++;
  }

  // 2. INSERT column-list: INSERT INTO t (a, b) VALUES (?, ?)
  const insertMatch = INSERT_REGEX.exec(sql);
  if (insertMatch) {
    const cols = insertMatch[1]
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);
    const valuesStart = sql.indexOf(insertMatch[2], insertMatch.index);
    const qRe = /\?/g;
    let i = 0;
    for (let tok = qRe.exec(insertMatch[2]); tok !== null && i < cols.length; tok = qRe.exec(insertMatch[2])) {
      colByOffset.set(valuesStart + tok.index, cols[i++]);
    }
  }

  // 3. Operator-based: col op ?  (WHERE / SET / HAVING …)
  const re = new RegExp(QUESTION_PARAM_REGEX, 'gi');
  for (let match = re.exec(sql); match !== null; match = re.exec(sql)) {
    const offset = match.index + match[0].lastIndexOf('?');
    if (!colByOffset.has(offset)) colByOffset.set(offset, match[1]);
  }

  // Walk every `?` left-to-right and assign columns from the map.
  let pos = 0;
  const allQRe = /\?/g;
  for (let tok = allQRe.exec(sql); tok !== null && pos < paramCount; tok = allQRe.exec(sql)) {
    result[pos++] = colByOffset.get(tok.index);
  }

  return result;
};

/**
 * Resolves mysql2 named placeholders (`:paramName`) to `{ col, key }` pairs.
 * Handles `<col> <op> :paramName` patterns (WHERE/SET) and INSERT column-list correlation.
 * Returns pairs in left-to-right order of appearance.
 *
 * @param {string} sql
 * @returns {{ col: string, key: string, inGroup?: number }[]}
 */
exports.resolveNamedParamColumns = function resolveNamedParamColumns(sql) {
  const result = [];

  const re = new RegExp(NAMED_PARAM_REGEX, 'gi');
  for (let match = re.exec(sql); match !== null; match = re.exec(sql)) {
    result.push({ col: match[1], key: match[2] });
  }

  let inGroup = 0;
  IN_COLLECTION_REGEX.lastIndex = 0;
  for (let m = IN_COLLECTION_REGEX.exec(sql); m !== null; m = IN_COLLECTION_REGEX.exec(sql)) {
    const col = m[1];
    const inner = m[2];
    const paramRe = /:([a-zA-Z][a-zA-Z0-9_]*)/g;
    let found = false;
    for (let tok = paramRe.exec(inner); tok !== null; tok = paramRe.exec(inner)) {
      result.push({ col, key: tok[1], inGroup });
      found = true;
    }
    if (found) inGroup++;
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
  const pairs = exports.resolveNamedParamColumns(sql);
  const binds = [];
  const consumedGroups = new Set();

  for (let i = 0; i < pairs.length; i++) {
    const { col, key, inGroup } = pairs[i];
    if (!exports.isColumnAllowed(col, allowedColumns)) continue;

    if (inGroup != null) {
      if (consumedGroups.has(inGroup)) continue;
      consumedGroups.add(inGroup);
      // Collect all values for this IN group
      const groupValues = [];
      for (let j = i; j < pairs.length; j++) {
        const p = pairs[j];
        if (p.inGroup === inGroup && Object.prototype.hasOwnProperty.call(namedValues, p.key)) {
          groupValues.push(namedValues[p.key]);
        }
      }
      if (groupValues.length === 0) continue;
      binds.push({ name: col, value: exports.normalizeBindValue(groupValues) });
    } else {
      if (!Object.prototype.hasOwnProperty.call(namedValues, key)) continue;
      binds.push({ name: col, value: exports.normalizeBindValue(namedValues[key]) });
    }

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

  try {
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
  } catch (_) {
    return null;
  }
};
