/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

module.exports.dropOrphanedTestTables = function dropOrphanedTestTables(conn) {
  try {
    const tables = conn.querySync(
      "SELECT TABNAME FROM SYSCAT.TABLES WHERE TYPE = 'T' AND TABSCHEMA = CURRENT SCHEMA" +
        ' AND CREATE_TIME < CURRENT TIMESTAMP - 120 MINUTES'
    );
    if (!(tables instanceof Array)) return;

    tables
      .filter(row => /^[A-Z]{8}$/.test(row.TABNAME))
      .forEach(row => {
        try {
          const result = conn.querySync(`DROP TABLE ${row.TABNAME}`);
          if (result instanceof Array) {
            console.log(`Dropped orphaned table: ${row.TABNAME}`);
          } else {
            console.log(`Failed to drop table ${row.TABNAME}: ${result}`);
          }
        } catch (e) {
          console.log(`Failed to drop table ${row.TABNAME}: ${e.message}`);
        }
      });
  } catch (e) {
    console.log('Failed to clean up orphaned tables:', e.message);
  }
};
