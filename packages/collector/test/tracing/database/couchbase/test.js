/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const fetch = require('node-fetch-v2');
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const {
  retry,
  delay,
  expectExactlyOneMatching,
  expectExactlyNMatching
} = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const DELAY_TIMEOUT_IN_MS = 500;
const connStr1 = process.env.COUCHBASE;
const connStr2 = process.env.COUCHBASE_ALTERNATIVE;
const webUi = process.env.COUCHBASE_WEB_UI;

const verifyCouchbaseSpan = (controls, entrySpan, options = {}) => [
  span => expect(span.t).to.equal(entrySpan.t),
  span => expect(span.p).to.equal(entrySpan.s),
  span => expect(span.n).to.equal('couchbase'),
  span => expect(span.k).to.equal(constants.EXIT),
  span => (options.error ? expect(span.ec).to.equal(1) : expect(span.ec).to.equal(0)),
  span => expect(span.f.e).to.equal(String(controls.getPid())),
  span => expect(span.f.h).to.equal('agent-stub-uuid'),
  span => expect(span.data.couchbase.hostname).to.equal('hostname' in options ? options.hostname : connStr1),
  span =>
    expect(span.data.couchbase.bucket).to.equal(
      // eslint-disable-next-line no-nested-ternary
      'bucket' in options ? (options.bucket === '' ? undefined : options.bucket) : 'projects'
    ),
  span =>
    expect(span.data.couchbase.type).to.equal(
      // eslint-disable-next-line no-nested-ternary
      'type' in options ? (options.type === '' ? undefined : options.type) : 'membase'
    ),
  span => expect(span.data.couchbase.sql).to.contain(options.sql || 'GET'),
  span =>
    options.error
      ? expect(span.data.couchbase.error).to.equal(options.error)
      : expect(span.data.couchbase.error).to.not.exist
];

const verifySpans = (agentControls, controls, options = {}) =>
  agentControls.getSpans().then(spans => {
    if (options.expectSpans === false) {
      expect(spans).to.be.empty;
      return;
    }

    const entrySpan = expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid')
    ]);

    expect(spans.length).to.equal(options.spanLength || 2);

    if (options.verifyCustom) return options.verifyCustom(entrySpan, spans);
    if (options.spanLength === 1) return;

    expectExactlyOneMatching(spans, verifyCouchbaseSpan(controls, entrySpan, options));
  });

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

let tries = 0;
const maxTries = 100;

async function configureCouchbase() {
  function encode(str) {
    // NOTE: btoa is not availbale < 16
    if (global.btoa) {
      return btoa(str);
    }
    return Buffer.from(str).toString('base64');
  }

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${encode('node:nodepwd')}`
    }
  };

  try {
    // Set memory quotas
    await fetch(`${webUi}/pools/default`, {
      ...requestOptions,
      body: 'memoryQuota=512&indexMemoryQuota=512'
    });

    // Setup services
    await fetch(`${webUi}/node/controller/setupServices`, {
      ...requestOptions,
      body: 'services=kv%2Ceventing%2Cindex%2Cn1ql%2Ccbas%2Cfts'
    });

    // Configure web settings
    await fetch(`${webUi}/settings/web`, {
      ...requestOptions,
      body: 'port=8091&username=node&password=nodepwd'
    });

    // NOTE: we need this delay because otherwise we could get a socket timeout
    //       from couchbase because we reset the credentials in the previous call
    await delay(5000);

    // Configure indexes settings
    await fetch(`${webUi}/settings/indexes`, {
      ...requestOptions,
      body: 'storageMode=memory_optimized'
    });

    // Create bucket 'projects'
    await fetch(`${webUi}/pools/default/buckets`, {
      ...requestOptions,
      body: 'name=projects&bucketType=couchbase&ramQuota=128&flushEnabled=1'
    });

    // Create bucket 'companies'
    await fetch(`${webUi}/pools/default/buckets`, {
      ...requestOptions,
      body: 'name=companies&bucketType=ephemeral&ramQuota=128&flushEnabled=1'
    });

    // eslint-disable-next-line no-console
    console.error('Initializing couchbase done');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Initializing couchbase ${err.message}`);

    if (tries > maxTries) {
      throw err;
    }

    tries += 1;
    await delay(1000);
    return configureCouchbase();
  }
}

const couchbaseVersions = ['latest', 'v443'];

couchbaseVersions.forEach(version => {
  // NOTE: require-mock is not working with esm apps. There is also no need to run the ESM APP for all versions.
  if (process.env.RUN_ESM && version !== 'latest') return;

  // NOTE: it takes 1-2 minutes till the couchbase server can be reached via docker
  mochaSuiteFn(`tracing/couchbase@${version}`, function () {
    this.timeout(config.getTestTimeout() * 4);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    let controls;

    before(async () => {
      await configureCouchbase();

      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
          COUCHBASE_CONN_STR_1: connStr1,
          COUCHBASE_CONN_STR_2: connStr2,
          COUCHBASE_VERSION: version
        }
      });

      // The operations for bootstrapping & cleanup can take a while.
      await controls.startAndWaitForAgentConnection(1000, Date.now() + 60 * 1000);
    });

    beforeEach(async () => {
      await delay(2000);
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    ['promise', 'callback'].forEach(apiType => {
      describe(apiType, function () {
        it('[crud] must trace get', () =>
          controls
            .sendRequest({
              method: 'get',
              path: `/get-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.result).to.eql({ foo: 1, bar: 2 });

              return retry(() =>
                verifySpans(agentControls, controls, {
                  spanLength: 3,
                  verifyCustom: (entrySpan, spans) => {
                    expectExactlyOneMatching(spans, verifyCouchbaseSpan(controls, entrySpan));

                    expectExactlyOneMatching(spans, [
                      span => expect(span.t).to.equal(entrySpan.t),
                      span => expect(span.p).to.equal(entrySpan.s),
                      span => expect(span.n).to.equal('node.http.client'),
                      span => expect(span.k).to.equal(constants.EXIT),
                      span => expect(span.f.e).to.equal(String(controls.getPid())),
                      span => expect(span.f.h).to.equal('agent-stub-uuid'),
                      span => expect(span.async).to.not.exist,
                      span => expect(span.error).to.not.exist,
                      span => expect(span.ec).to.equal(0),
                      span => expect(span.data.http.method).to.equal('GET'),
                      span => expect(span.data.http.url).to.contain('/'),
                      span => expect(span.data.http.status).to.equal(200)
                    ]);
                  }
                })
              );
            }));

        it('[crud] must trace two different buckets', () =>
          controls
            .sendRequest({
              method: 'get',
              path: `/get-buckets-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.success).to.eql(true);

              return retry(() =>
                verifySpans(agentControls, controls, {
                  spanLength: 3,
                  verifyCustom: (entrySpan, spans) => {
                    expectExactlyOneMatching(spans, verifyCouchbaseSpan(controls, entrySpan));

                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: 'companies',
                        type: 'ephemeral',
                        sql: 'INSERT'
                      })
                    );
                  }
                })
              );
            }));

        it('[crud] must trace getAndTouch', () =>
          controls
            .sendRequest({
              method: 'post',
              path: `/getAndTouch-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.success).to.eql(true);
              return retry(() => verifySpans(agentControls, controls, { sql: 'GET AND TOUCH' }));
            }));

        it('[crud] must trace replace', () =>
          controls
            .sendRequest({
              method: 'post',
              path: `/replace-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.result).to.eql('replacedvalue');

              return retry(() =>
                verifySpans(agentControls, controls, {
                  spanLength: 3,
                  verifyCustom: (entrySpan, spans) => {
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, { bucket: 'projects', type: 'membase', sql: 'REPLACE' })
                    );

                    expectExactlyOneMatching(spans, verifyCouchbaseSpan(controls, entrySpan));
                  }
                })
              );
            }));

        it('[crud] must trace insert', () =>
          controls
            .sendRequest({
              method: 'post',
              path: `/insert-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.success).to.eql(true);
              return retry(() => verifySpans(agentControls, controls, { sql: 'INSERT' }));
            }));

        it('[crud] must trace upsert', () =>
          controls
            .sendRequest({
              method: 'post',
              path: `/upsert-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.success).to.eql(true);
              return retry(() => verifySpans(agentControls, controls, { sql: 'UPSERT' }));
            }));

        it('[crud] must trace mutateIn', () =>
          controls
            .sendRequest({
              method: 'post',
              path: `/mutateIn-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.success).to.eql(true);
              return retry(() => verifySpans(agentControls, controls, { sql: 'MUTATE IN' }));
            }));

        it('[crud] must trace lookupIn', () =>
          controls
            .sendRequest({
              method: 'get',
              path: `/lookupIn-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.result).to.eql(2);
              return retry(() => verifySpans(agentControls, controls, { sql: 'LOOKUP IN' }));
            }));

        it('[crud] must trace exists', () =>
          controls
            .sendRequest({
              method: 'get',
              path: `/exists-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.result).to.eql(true);
              return retry(() => verifySpans(agentControls, controls, { sql: 'EXISTS' }));
            }));

        it('[crud] must trace remove', () =>
          controls
            .sendRequest({
              method: 'post',
              path: `/remove-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.success).to.eql(true);
              return retry(() => verifySpans(agentControls, controls, { sql: 'REMOVE' }));
            }));

        it('[searchIndexes] must trace', () =>
          controls
            .sendRequest({
              method: 'post',
              path: `/searchindexes-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.success).to.eql(true);

              return retry(() =>
                verifySpans(agentControls, controls, {
                  spanLength: 5,
                  verifyCustom: (entrySpan, spans) => {
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: 'projects',
                        type: 'membase',
                        sql: 'UPSERT INDEX'
                      })
                    );
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: 'projects',
                        type: 'membase',
                        sql: 'GET INDEX'
                      })
                    );
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: 'projects',
                        type: 'membase',
                        sql: 'GET ALL INDEXES'
                      })
                    );
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        type: '',
                        sql: 'DROP INDEX'
                      })
                    );
                  }
                })
              );
            }));

        it('[analyticsindexes] must trace', () =>
          controls
            .sendRequest({
              method: 'post',
              path: `/analyticsindexes-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.success).to.eql(true);

              return retry(() =>
                verifySpans(agentControls, controls, {
                  spanLength: 9,
                  verifyCustom: (entrySpan, spans) => {
                    expectExactlyNMatching(
                      spans,
                      1,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        type: '',
                        sql: 'CREATE DATAVERSE '
                      })
                    );
                    expectExactlyNMatching(
                      spans,
                      1,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        type: '',
                        sql: 'CREATE DATASET '
                      })
                    );
                    expectExactlyNMatching(
                      spans,
                      1,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        type: '',
                        sql: 'CREATE INDEX '
                      })
                    );
                    expectExactlyNMatching(
                      spans,
                      1,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        type: '',
                        sql: 'DROP INDEX '
                      })
                    );
                    expectExactlyNMatching(
                      spans,
                      1,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        type: '',
                        sql: 'DROP DATASET '
                      })
                    );
                    expectExactlyNMatching(
                      spans,
                      1,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        type: '',
                        sql: 'DROP DATAVERSE '
                      })
                    );

                    // It is difficult to get exact query from couchbase after v4.4.4 release
                    // as they are not generating queries from JS anymore, so we use the function name instead
                    // for v443, we use partial query statement
                    expectExactlyNMatching(
                      spans,
                      1,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        type: '',
                        sql: version === 'v443' ? 'SELECT ' : 'GET ALL INDEXES'
                      })
                    );
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: 'projects',
                        type: 'membase',
                        sql: version === 'v443' ? 'SELECT ' : 'GET ALL DATASETS '
                      })
                    );
                  }
                })
              );
            }));

        it('[searchquery] must trace', () =>
          controls
            .sendRequest({
              method: 'get',
              path: `/searchquery-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.success).to.eql(true);

              return retry(() =>
                verifySpans(agentControls, controls, {
                  spanLength: 4,
                  verifyCustom: (entrySpan, spans) => {
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        type: '',
                        sql: 'SEARCH QUERY'
                      })
                    );
                  }
                })
              );
            }));

        // NOTE: callbacks for transactions are not supported.
        if (apiType === 'promise') {
          it('must trace transactions', () =>
            controls
              .sendRequest({
                method: 'get',
                path: `/transactions-${apiType}`
              })
              .then(resp => {
                if (resp.err) {
                  throw new Error(resp.err);
                }

                expect(resp.success).to.eql(true);

                return retry(() =>
                  verifySpans(agentControls, controls, {
                    spanLength: 5,
                    verifyCustom: (entrySpan, spans) => {
                      expectExactlyOneMatching(
                        spans,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'GET'
                        })
                      );
                      expectExactlyOneMatching(
                        spans,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'INSERT'
                        })
                      );
                      expectExactlyOneMatching(
                        spans,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'REMOVE'
                        })
                      );

                      expectExactlyOneMatching(
                        spans,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          bucket: '',
                          type: '',
                          sql: 'COMMIT'
                        })
                      );
                    }
                  })
                );
              }));

          it('must trace transactions on rollback', () =>
            controls
              .sendRequest({
                method: 'get',
                path: `/transactions-${apiType}?rollback=true`
              })
              .then(resp => {
                if (resp.err) {
                  throw new Error(resp.err);
                }

                expect(resp.success).to.eql(true);

                return retry(() =>
                  verifySpans(agentControls, controls, {
                    spanLength: 4,
                    verifyCustom: (entrySpan, spans) => {
                      expectExactlyOneMatching(
                        spans,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'GET'
                        })
                      );
                      expectExactlyOneMatching(
                        spans,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'INSERT'
                        })
                      );
                      expectExactlyOneMatching(
                        spans,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          bucket: '',
                          type: '',
                          sql: 'ROLLBACK'
                        })
                      );
                    }
                  })
                );
              }));
        }

        it('[queryindexes] must trace', () =>
          controls
            .sendRequest({
              method: 'post',
              path: `/queryindexes-${apiType}`
            })
            .then(resp => {
              if (resp.err) {
                throw new Error(resp.err);
              }

              expect(resp.success).to.eql(true);

              return retry(() =>
                verifySpans(agentControls, controls, {
                  spanLength: 9,
                  verifyCustom: (entrySpan, spans) => {
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        sql: 'CREATE INDEX'
                      })
                    );
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: 'companies',
                        type: 'ephemeral',
                        sql: 'CREATE INDEX'
                      })
                    );

                    // cluster query
                    expectExactlyNMatching(
                      spans,
                      1,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        type: '',
                        sql: 'SELECT * FROM projects WHERE name='
                      })
                    );

                    // bucket query success
                    expectExactlyNMatching(
                      spans,
                      1,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: 'companies',
                        type: 'ephemeral',
                        sql: 'SELECT * FROM _default WHERE name='
                      })
                    );

                    // bucket query error
                    expectExactlyNMatching(
                      spans,
                      1,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: 'companies',
                        // FYI: this error msg does not come from us.
                        error: 'bucket not found',
                        type: 'ephemeral',
                        sql: 'SELECT * FROM TABLE_DOES_NOT_EXIST WHERE name'
                      })
                    );

                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        sql: 'DROP INDEX'
                      })
                    );
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: 'companies',
                        type: 'ephemeral',
                        sql: 'DROP INDEX'
                      })
                    );
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: 'companies',
                        type: 'ephemeral',
                        sql: 'GET ALL INDEXES'
                      })
                    );
                  }
                })
              );
            }));

        if (apiType === 'promise') {
          it('[multiple connections] must trace', () =>
            controls
              .sendRequest({
                method: 'get',
                path: `/multiple-connections-${apiType}`
              })
              .then(resp => {
                if (resp.err) {
                  throw new Error(resp.err);
                }

                expect(resp.success).to.eql(true);

                return retry(() =>
                  verifySpans(agentControls, controls, {
                    spanLength: 5,
                    verifyCustom: (entrySpan, spans) => {
                      expectExactlyOneMatching(
                        spans,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          bucket: '',
                          type: '',
                          sql: 'SELECT * FROM'
                        })
                      );
                      expectExactlyOneMatching(
                        spans,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          bucket: '',
                          hostname: connStr2,
                          type: '',
                          sql: 'SELECT * FROM'
                        })
                      );
                    }
                  })
                );
              }));
        }

        if (apiType === 'promise') {
          it('[datastructures list] must trace', () =>
            controls
              .sendRequest({
                method: 'get',
                path: `/datastructures-list-${apiType}`
              })
              .then(resp => {
                if (resp.err) {
                  throw new Error(resp.err);
                }

                expect(resp.iteratedItems).to.eql(['test1', 'test2']);

                return retry(() =>
                  verifySpans(agentControls, controls, {
                    spanLength: 9,
                    verifyCustom: (entrySpan, spans) => {
                      expectExactlyNMatching(
                        spans,
                        3,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'MUTATE IN'
                        })
                      );
                      expectExactlyNMatching(
                        spans,
                        2,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'LOOKUP IN'
                        })
                      );
                      expectExactlyNMatching(
                        spans,
                        3,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'GET'
                        })
                      );
                    }
                  })
                );
              }));

          it('[datastructures map] must trace', () =>
            controls
              .sendRequest({
                method: 'get',
                path: `/datastructures-map-${apiType}`
              })
              .then(resp => {
                if (resp.err) {
                  throw new Error(resp.err);
                }

                expect(resp.iteratedItems).to.eql(['test1', 'test2']);

                return retry(() =>
                  verifySpans(agentControls, controls, {
                    spanLength: 9,
                    verifyCustom: (entrySpan, spans) => {
                      expectExactlyNMatching(
                        spans,
                        3,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'MUTATE IN'
                        })
                      );
                      expectExactlyNMatching(
                        spans,
                        3,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'LOOKUP IN'
                        })
                      );
                      expectExactlyNMatching(
                        spans,
                        2,
                        verifyCouchbaseSpan(controls, entrySpan, {
                          sql: 'GET'
                        })
                      );
                    }
                  })
                );
              }));

          // Error handling in callback is affected with v4.4.4,
          // see issue here: https://github.com/couchbase/couchnode/issues/123
          it('[error] must trace remove', () =>
            controls
              .sendRequest({
                method: 'post',
                path: `/remove-${apiType}?error=true`
              })
              .then(resp => {
                if (resp.err) {
                  throw new Error(resp.err);
                }

                expect(resp.errMsg).to.eql(apiType === 'promise' ? 'invalid argument' : 'document not found');

                return retry(() =>
                  verifySpans(agentControls, controls, {
                    sql: 'REMOVE',
                    error: apiType === 'promise' ? 'invalid argument' : 'document not found'
                  })
                );
              }));
        }

        it('[supressed] must not trace', () =>
          controls
            .sendRequest({
              method: 'post',
              path: `/upsert-${apiType}`,
              suppressTracing: true
            })
            .then(() => delay(DELAY_TIMEOUT_IN_MS))
            .then(() => retry(() => verifySpans(agentControls, controls, { expectSpans: false }))));
      });
    });
  });
});
