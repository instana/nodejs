/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core/src/tracing/constants');
const config = require('@_local/core/test/config');
const {
  retry,
  getSpansByName,
  expectAtLeastOneMatching,
  expectExactlyOneMatching
} = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        LIBRARY_LATEST: isLatest,
        LIBRARY_VERSION: version,
        LIBRARY_NAME: name
      }
    });

    await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  it('parameterized queries', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/parameterized-query'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/parameterized-query');
            const query = 'SELECT * FROM users WHERE name = $1';
            verifyPgExit(spans, httpEntry, query);
          })
        )
      ));

  it('must not capture bind variables by default', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/bind-variables-test'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            verifyHttpEntry(spans, '/bind-variables-test');
            const pgSpans = getSpansByName(spans, 'postgres');
            pgSpans.forEach(span => {
              expect(span.data.pg.binds).to.not.exist;
            });
          })
        )
      ));

  // -------------------------------------------------------------------------
  // Spec: Allowed-columns filter
  // -------------------------------------------------------------------------
  describe('with INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE=false and allowed-columns=name', () => {
    before(async () => {
      await controls.stop();
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'name';
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    after(async () => {
      await controls.stop();
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    // Spec example: allowed-columns filter — only `name` captured, `email` omitted
    it('must capture only the allowed column (name), not email — SELECT', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-allowed-columns-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-allowed-columns-test');

              const selectSpan = getSpansByName(spans, 'postgres').find(
                span => span.data.pg.stmt === 'SELECT * FROM users WHERE name = $1 AND email = $2'
              );
              expect(selectSpan).to.exist;
              expect(selectSpan.data.pg.binds).to.be.an('array');
              expect(selectSpan.data.pg.binds).to.have.lengthOf(1);
              expect(selectSpan.data.pg.binds[0]).to.deep.equal({ name: 'name', value: 'alloweduser' });
            })
          )
        ));

    // Spec example: allowed-columns filter — UPDATE SET col=$N pattern, only `name` captured
    it('must capture only the allowed column (name), not email — UPDATE', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-allowed-columns-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-allowed-columns-test');

              const updateSpan = getSpansByName(spans, 'postgres').find(
                span => span.data.pg.stmt === 'UPDATE users SET name = $1, email = $2 WHERE id = $3'
              );
              expect(updateSpan).to.exist;
              expect(updateSpan.data.pg.binds).to.be.an('array');
              expect(updateSpan.data.pg.binds).to.have.lengthOf(1);
              expect(updateSpan.data.pg.binds[0]).to.deep.equal({ name: 'name', value: 'updatedname' });
            })
          )
        ));

    // Spec: positional params in INSERT VALUES list are not resolvable — binds must be absent
    it('must not capture binds for INSERT (positional params in VALUES list not resolvable)', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-test');

              const insertSpan = getSpansByName(spans, 'postgres').find(
                span => span.data.pg.stmt === 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *'
              );
              expect(insertSpan).to.exist;
              expect(insertSpan.data.pg.binds).to.not.exist;
            })
          )
        ));

    // Spec: string-query + array-params API style
    it('must capture the allowed column from a string+array style query', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-test');

              const selectSpan = getSpansByName(spans, 'postgres').find(
                span => span.data.pg.stmt === 'SELECT * FROM users WHERE name = $1 AND email = $2'
              );
              expect(selectSpan).to.exist;
              expect(selectSpan.data.pg.binds).to.be.an('array');
              expect(selectSpan.data.pg.binds).to.have.lengthOf(1);
              expect(selectSpan.data.pg.binds[0]).to.deep.equal({ name: 'name', value: 'testuser' });
            })
          )
        ));

    // Spec example: OR clause — same column with different params → two separate entries
    it('must capture two separate binds entries for OR clause on the same column', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-or-clause-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-or-clause-test');

              const orSpan = getSpansByName(spans, 'postgres').find(
                span => span.data.pg.stmt === 'SELECT * FROM users WHERE name = $1 OR name = $2'
              );
              expect(orSpan).to.exist;
              expect(orSpan.data.pg.binds).to.be.an('array');
              expect(orSpan.data.pg.binds).to.have.lengthOf(2);
              // Each occurrence is a distinct entry per spec
              expect(orSpan.data.pg.binds[0]).to.deep.equal({ name: 'name', value: 'alice' });
              expect(orSpan.data.pg.binds[1]).to.deep.equal({ name: 'name', value: 'bob' });
            })
          )
        ));

    // Spec: null values must be represented as the string "null"
    it('must represent null bind values as the string "null"', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-null-value-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-null-value-test');

              const nullSpan = getSpansByName(spans, 'postgres').find(
                span => span.data.pg.stmt === 'SELECT * FROM users WHERE name = $1'
              );
              expect(nullSpan).to.exist;
              expect(nullSpan.data.pg.binds).to.be.an('array');
              expect(nullSpan.data.pg.binds).to.have.lengthOf(1);
              expect(nullSpan.data.pg.binds[0]).to.deep.equal({ name: 'name', value: 'null' });
            })
          )
        ));
  });

  // -------------------------------------------------------------------------
  // Spec: Binary data represented as "<binary>"
  // -------------------------------------------------------------------------
  describe('with allowed-columns=data,name — binary Buffer value', () => {
    before(async () => {
      await controls.stop();
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'data,name';
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    after(async () => {
      await controls.stop();
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    // Spec: Binary data (Buffer) MUST be represented as "<binary>"
    it('must represent a Buffer bind value as "<binary>"', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-binary-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-binary-test');

              const span = getSpansByName(spans, 'postgres').find(
                s => s.data.pg.stmt === 'UPDATE blobs SET data = $1 WHERE name = $2'
              );
              expect(span).to.exist;
              expect(span.data.pg.binds).to.be.an('array');
              expect(span.data.pg.binds).to.have.lengthOf(2);
              expect(span.data.pg.binds[0]).to.deep.equal({ name: 'data', value: '<binary>' });
              expect(span.data.pg.binds[1]).to.deep.equal({ name: 'name', value: 'testblob' });
            })
          )
        ));
  });

  // -------------------------------------------------------------------------
  // Spec: Unsupported type (plain object) represented as "<unsupported>"
  // -------------------------------------------------------------------------
  describe('with allowed-columns=name — unsupported plain object value', () => {
    before(async () => {
      await controls.stop();
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'name';
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    after(async () => {
      await controls.stop();
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    // Spec: Plain objects SHOULD be represented as "<unsupported>"
    it('must represent a plain object bind value as "<unsupported>"', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-unsupported-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-unsupported-test');

              const span = getSpansByName(spans, 'postgres').find(
                s => s.data.pg.stmt === 'SELECT * FROM users WHERE name = $1'
              );
              expect(span).to.exist;
              expect(span.data.pg.binds).to.be.an('array');
              expect(span.data.pg.binds).to.have.lengthOf(1);
              expect(span.data.pg.binds[0]).to.deep.equal({ name: 'name', value: '<unsupported>' });
            })
          )
        ));
  });

  // -------------------------------------------------------------------------
  // Spec: Stored procedure — bind variable captured for the function call argument
  // -------------------------------------------------------------------------
  describe('with allowed-columns=name — stored procedure call', () => {
    before(async () => {
      await controls.stop();
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'name';
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    after(async () => {
      await controls.stop();
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    // pg does not expose column-name metadata for stored procedure arguments,
    // so our SQL parser cannot resolve a column name for `SELECT * FROM fn($1)`.
    // Per spec rule 5: values MUST be ignored if the tracer cannot resolve the index.
    it('must not capture binds for stored procedure call (parameter not resolvable to a column name)', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-stored-procedure-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-stored-procedure-test');

              const span = getSpansByName(spans, 'postgres').find(
                s => s.data.pg.stmt === 'SELECT * FROM get_user_by_name($1)'
              );
              expect(span).to.exist;
              expect(span.data.pg.binds).to.not.exist;
            })
          )
        ));
  });

  // -------------------------------------------------------------------------
  // Spec: Bind count cap — at most 100 entries collected per span
  // -------------------------------------------------------------------------
  describe('with allowed-columns=name — 150 params (50 allowed in first 100, 50 from remaining 50), capped at 100', () => {
    before(async () => {
      await controls.stop();
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'name';
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    after(async () => {
      await controls.stop();
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    // Spec rule 6: cap is applied AFTER allowed-columns filtering.
    // 150 params total:
    //   indices 0-99  (first 100): even → name (allowed), odd → email (not allowed) → 50 name, 50 email
    //   indices 100-149 (last 50): all name (allowed)
    // The tracer scans past all 50 email entries in the first 100 and collects
    // 50 more from indices 100-149 to reach exactly 100. No params are left.
    it('must scan past non-allowed entries and fill from remaining params to reach the 100 cap', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-cap-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-cap-test');

              const span = getSpansByName(spans, 'postgres').find(
                s => s.data.pg.stmt && s.data.pg.stmt.includes('name = $1')
              );
              expect(span).to.exist;
              expect(span.data.pg.binds).to.be.an('array');

              // Exactly 100 entries — the cap is enforced
              expect(span.data.pg.binds).to.have.lengthOf(100);

              // All captured entries must be 'name' (email is not in allowed-columns)
              span.data.pg.binds.forEach(b => expect(b.name).to.equal('name'));

              // First captured: index 0 (even → name), value val0
              expect(span.data.pg.binds[0]).to.deep.equal({ name: 'name', value: 'val0' });

              // Second captured: index 2 (next even → name), value val2
              expect(span.data.pg.binds[1]).to.deep.equal({ name: 'name', value: 'val2' });

              // 50th captured (index 49 in binds): last name from first 100 = param index 98 (even), value val98
              expect(span.data.pg.binds[49]).to.deep.equal({ name: 'name', value: 'val98' });

              // 51st captured (index 50 in binds): first fill-in from remainder = param index 100, value val100
              expect(span.data.pg.binds[50]).to.deep.equal({ name: 'name', value: 'val100' });

              // 100th captured (index 99 in binds): last fill-in = param index 149, value val149
              expect(span.data.pg.binds[99]).to.deep.equal({ name: 'name', value: 'val149' });
            })
          )
        ));
  });

  // -------------------------------------------------------------------------
  // Spec: Span batching — only the final merged statement's binds are reported
  // -------------------------------------------------------------------------
  describe('with allowed-columns=name and span batching enabled', () => {
    before(async () => {
      await controls.stop();
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'name';
      controls.env.INSTANA_SPANBATCHING_ENABLED = 'true';
      controls.env.INSTANA_DEV_BATCH_THRESHOLD = '100';
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    after(async () => {
      await controls.stop();
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
      delete controls.env.INSTANA_SPANBATCHING_ENABLED;
      delete controls.env.INSTANA_DEV_BATCH_THRESHOLD;
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    // Spec rule 7: when span batching merges statements into one span, binds MUST only be
    // collected for the final merged statement; earlier statements' binds are discarded.
    it('must only report bind variables from the final merged statement', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-span-batching-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-span-batching-test');

              const pgSpans = getSpansByName(spans, 'postgres');
              // Batched spans are merged; there may be 1 or 2 depending on timing
              expect(pgSpans.length).to.be.at.least(1);

              // The last span must carry only 'last-query' binds (from the final statement)
              const lastPgSpan = pgSpans[pgSpans.length - 1];
              expect(lastPgSpan.data.pg.binds).to.be.an('array');
              expect(lastPgSpan.data.pg.binds).to.have.lengthOf(1);
              expect(lastPgSpan.data.pg.binds[0]).to.deep.equal({ name: 'name', value: 'last-query' });
            })
          )
        ));
  });

  // -------------------------------------------------------------------------
  // Spec: Allowed-columns matching — unqualified entry matches qualified column
  // -------------------------------------------------------------------------
  describe('with allowed-columns=id (unqualified) and a query using orders.id (qualified)', () => {
    before(async () => {
      await controls.stop();
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'id';
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    after(async () => {
      await controls.stop();
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    // Spec example: unqualified entry `id` matches qualified `orders.id` in the query
    it('must capture orders.id when allowed-columns entry is the unqualified id', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-qualified-col-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-qualified-col-test');

              const span = getSpansByName(spans, 'postgres').find(
                s => s.data.pg.stmt === 'SELECT * FROM orders WHERE orders.id = $1'
              );
              expect(span).to.exist;
              expect(span.data.pg.binds).to.be.an('array');
              expect(span.data.pg.binds).to.have.lengthOf(1);
              // name reflects the qualified form as it appears in the query
              expect(span.data.pg.binds[0]).to.deep.equal({ name: 'orders.id', value: '42' });
            })
          )
        ));
  });

  // -------------------------------------------------------------------------
  // Spec: Allowed-columns matching — fully qualified entry does NOT match bare column
  // -------------------------------------------------------------------------
  describe('with allowed-columns=orders.id (qualified) and a query using bare id', () => {
    before(async () => {
      await controls.stop();
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'orders.id';
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    after(async () => {
      await controls.stop();
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    // Spec example: qualified entry `orders.id` must NOT match a bare `id` in the query
    it('must NOT capture bare id when allowed-columns entry is fully qualified orders.id', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-qualified-entry-no-match-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-qualified-entry-no-match-test');

              const span = getSpansByName(spans, 'postgres').find(
                s => s.data.pg.stmt === 'SELECT * FROM users WHERE id = $1'
              );
              expect(span).to.exist;
              expect(span.data.pg.binds).to.not.exist;
            })
          )
        ));
  });

  // -------------------------------------------------------------------------
  // Spec: Kill switch — disable=true suppresses capture even with allowed-columns set
  // -------------------------------------------------------------------------
  describe('with INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE=true (kill switch)', () => {
    before(async () => {
      await controls.stop();
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'true';
      controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'name';
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    after(async () => {
      await controls.stop();
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
      delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
      await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
    });

    // Spec: kill switch suppresses capture regardless of allowed-columns
    it('must not capture any bind variables when disable=true, even with allowed-columns set', () =>
      controls
        .sendRequest({ method: 'GET', path: '/bind-variables-allowed-columns-test' })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables-allowed-columns-test');

              const pgSpans = getSpansByName(spans, 'postgres');
              expect(pgSpans.length).to.be.greaterThan(0);
              pgSpans.forEach(span => {
                expect(span.data.pg.binds).to.not.exist;
              });
            })
          )
        ));
  });

  it('must trace pooled select now', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-now-pool'
      })
      .then(response => {
        verifySimpleSelectResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/select-now-pool');
            verifyPgExit(spans, httpEntry, 'SELECT NOW()');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace non-pooled query with callback', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-now-no-pool-callback'
      })
      .then(response => {
        verifySimpleSelectResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/select-now-no-pool-callback');
            verifyPgExit(spans, httpEntry, 'SELECT NOW()');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace non-pooled query with promise', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-now-no-pool-promise'
      })
      .then(response => {
        verifySimpleSelectResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/select-now-no-pool-promise');
            verifyPgExit(spans, httpEntry, 'SELECT NOW()');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must not associate unrelated calls with long query span', () => {
    setTimeout(() => {
      controls.sendRequest({
        method: 'GET',
        path: '/quick-query'
      });
      setTimeout(() => {
        controls.sendRequest({
          method: 'GET',
          path: '/quick-query'
        });
        setTimeout(() => {
          controls.sendRequest({
            method: 'GET',
            path: '/quick-query'
          });
        }, 200);
      }, 200);
    }, 500);
    return controls
      .sendRequest({
        method: 'GET',
        path: '/long-running-query'
      })
      .then(response => {
        verifySimpleSelectResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntryLong = verifyHttpEntry(spans, '/long-running-query');
            const httpEntriesQuick = [];
            httpEntriesQuick[0] = verifyUniqueHttpEntry(spans, 'GET', '/quick-query', httpEntriesQuick);
            httpEntriesQuick[1] = verifyUniqueHttpEntry(spans, 'GET', '/quick-query', httpEntriesQuick);
            httpEntriesQuick[2] = verifyUniqueHttpEntry(spans, 'GET', '/quick-query', httpEntriesQuick);

            const allPgExitsFromLongQuery = spans.filter(s => s.n === 'postgres' && s.t === httpEntryLong.t);
            expect(allPgExitsFromLongQuery).to.have.lengthOf(1);
            for (let i = 0; i < httpEntriesQuick.length; i++) {
              const allPgExitsFromQuickQuery = spans.filter(s => s.n === 'postgres' && s.t === httpEntriesQuick[i].t);
              expect(allPgExitsFromQuickQuery).to.have.lengthOf(1);
            }
          })
        );
      });
  });

  it('must trace string based pool insert', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pool-string-insert'
      })
      .then(response => {
        verifyInsertResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/pool-string-insert');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace config object based pool select', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pool-config-select'
      })
      .then(response => {
        expect(response).to.exist;
        expect(response.command).to.equal('SELECT');
        expect(response.rowCount).to.be.a('number');

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/pool-config-select');
            verifyPgExit(spans, httpEntry, 'SELECT name, email FROM users');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace promise based pool select', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pool-config-select-promise'
      })
      .then(response => {
        verifyInsertResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/pool-config-select-promise');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace string based client insert', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/client-string-insert'
      })
      .then(response => {
        verifyInsertResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/client-string-insert');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace config object based client select', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/client-config-select'
      })
      .then(response => {
        expect(response).to.exist;
        expect(response.command).to.equal('SELECT');
        expect(response.rowCount).to.be.a('number');

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/client-config-select');
            verifyPgExit(spans, httpEntry, 'SELECT name, email FROM users');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must capture errors', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/table-doesnt-exist',
        simple: false
      })
      .then(response => {
        expect(response).to.exist;
        expect(response.severity).to.equal('ERROR');
        // 42P01 -> PostgreSQL's code for "relation does not exist"
        expect(response.code).to.equal('42P01');

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/table-doesnt-exist');
            verifyPgExitWithError(
              spans,
              httpEntry,
              'SELECT name, email FROM nonexistanttable',
              'relation "nonexistanttable" does not exist'
            );
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must not break vanilla postgres (not tracing)', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pool-string-insert',
        suppressTracing: true
      })
      .then(response => {
        verifyInsertResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpans = getSpansByName(spans, 'node.http.server');
            expect(entrySpans).to.have.lengthOf(0);
            const pgExits = getSpansByName(spans, 'postgres');
            expect(pgExits).to.have.lengthOf(0);
          })
        );
      }));

  it('must trace transactions', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/transaction'
      })
      .then(response => {
        verifyInsertResponse(response, 'trans2', 'nodejstests@blah');
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/transaction');
            expect(getSpansByName(spans, 'postgres')).to.have.lengthOf(4);
            verifyPgExit(spans, httpEntry, 'BEGIN');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyPgExit(spans, httpEntry, 'COMMIT');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('trace all asynchronous queries', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/asynchronous-query'
      })
      .then(response => {
        expect(response).to.exist;

        return retry(() =>
          agentControls.getSpans().then(spans => {
            expect(getSpansByName(spans, 'postgres')).to.have.lengthOf(3);
            const httpEntry = verifyHttpEntry(spans, '/asynchronous-query');
            verifyPgExit(spans, httpEntry, 'SELECT NOW()');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyPgExit(spans, httpEntry, 'SELECT NOW() FROM pg_sleep(2)');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  function verifySimpleSelectResponse(response) {
    expect(response).to.exist;
    expect(response.command).to.equal('SELECT');
    expect(response.rowCount).to.equal(1);
    expect(response.rows.length).to.equal(1);
    expect(response.rows[0].now).to.be.a('string');
  }

  function verifyInsertResponse(response, expectedName = 'beaker', email = 'beaker@muppets.com') {
    expect(response).to.exist;
    expect(response.command).to.equal('INSERT');
    expect(response.rowCount).to.equal(1);
    expect(response.rows.length).to.equal(1);
    expect(response.rows[0].name).to.equal(expectedName);
    expect(response.rows[0].email).to.equal(email);
  }

  function verifyHttpEntry(spans, url) {
    return expectAtLeastOneMatching(spans, [
      span => expect(span.p).to.not.exist,
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.data.http.url).to.equal(url)
    ]);
  }

  function verifyPgExit(spans, parent, statement) {
    return expectAtLeastOneMatching(spans, span => {
      verifyPgExitBase(span, parent, statement);
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
    });
  }

  function verifyPgExitWithError(spans, parent, statement, errorMessage) {
    return expectAtLeastOneMatching(spans, span => {
      verifyPgExitBase(span, parent, statement);
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(1);
      expect(span.data.pg.error).to.contain(errorMessage);
    });
  }

  function verifyPgExitBase(span, parent, statement) {
    expect(span.n).to.equal('postgres');
    expect(span.k).to.equal(constants.EXIT);
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.f.e).to.equal(String(controls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.async).to.not.exist;
    expect(span.data).to.exist;
    expect(span.data.pg).to.exist;
    expect(span.data.pg.host).to.equal('127.0.0.1');
    expect(span.data.pg.port).to.equal(5432);
    expect(span.data.pg.user).to.equal('node');
    expect(span.data.pg.db).to.equal('nodedb');
    expect(span.data.pg.stmt).to.equal(statement);
  }

  function verifyUniqueHttpEntry(spans, method, url, other) {
    return expectAtLeastOneMatching(spans, span => {
      expect(span.p).to.not.exist;
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.n).to.equal('node.http.server');
      expect(span.data.http.method).to.equal(method);
      expect(span.data.http.url).to.equal(url);
      for (let i = 0; i < other.length; i++) {
        expect(span.t).to.not.equal(other[i].t);
        expect(span.s).to.not.equal(other[i].s);
      }
    });
  }

  function verifyHttpExit(spans, parent) {
    expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.p).to.equal(parent.s),
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0),
      span => expect(span.data.http.method).to.equal('GET'),
      span => expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/),
      span => expect(span.data.http.status).to.equal(200)
    ]);
  }
};
