/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

module.exports.dropOrphanedTestTables = function dropOrphanedTestTables(conn) {
  try {
    const tables = conn.querySync(
      "SELECT TABNAME FROM SYSCAT.TABLES WHERE TYPE = 'T' AND TABSCHEMA = CURRENT SCHEMA" +
        ' AND CREATE_TIME < CURRENT TIMESTAMP - 30 MINUTES'
    );
    if (!(tables instanceof Array)) return;

    for (const row of tables) {
      if (/^[A-Z]{8}$/.test(row.TABNAME)) {
        try {
          conn.querySync(`DROP TABLE ${row.TABNAME}`);
          console.log(`Dropped orphaned table: ${row.TABNAME}`);
        } catch (e) {
          // ignore individual drop failures
        }
      }
    }
  } catch (e) {
    console.log('Failed to clean up orphaned tables:', e.message);
  }
};
