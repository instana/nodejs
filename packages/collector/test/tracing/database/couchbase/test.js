/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const {
  isCI,
  retry,
  delay,
  expectExactlyOneMatching,
  expectExactlyNMatching
} = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const DELAY_TIMEOUT_IN_MS = 500;
let connStr1 = process.env.COUCHBASE;
let connStr2 = process.env.COUCHBASE_ALTERNATIVE;

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
  span => expect(span.data.couchbase.sql).to.equal(options.sql || 'GET'),
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

const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '12.0.0') ? describe : describe.skip;

// NOTE: it takes 1-2 minutes till the couchbase server can be reached via docker
mochaSuiteFn('tracing/couchbase', function () {
  this.timeout(config.getTestTimeout() * 4);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let controls;

  before(async () => {
    // NOTE: The CircleCI container is called "couchbase". It's hostname is therefore "couchbase", not "localhost".
    //       The "couchbase-setup" container is able to initialize the cluster etc. via the domain name "couchbase".
    const dns = require('dns');
    const dnsPromises = dns.promises;

    if (isCI()) {
      const data = await dnsPromises.lookup('couchbase', { family: 4 });
      if (data && data.address) {
        connStr2 = `couchbase://${data.address}`;
      }

      connStr1 = 'couchbase://couchbase';
    }

    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        COUCHBASE_CONN_STR_1: connStr1,
        COUCHBASE_CONN_STR_2: connStr2
      }
    });

    // The operations for bootstrapping & cleanup can take a while.
    await controls.startAndWaitForAgentConnection(1000, Date.now() + 30 * 1000);
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
            expect(resp.success).to.eql(true);

            return retry(() =>
              verifySpans(agentControls, controls, {
                spanLength: 3,
                verifyCustom: (entrySpan, spans) => {
                  expectExactlyOneMatching(spans, verifyCouchbaseSpan(controls, entrySpan));

                  expectExactlyOneMatching(
                    spans,
                    verifyCouchbaseSpan(controls, entrySpan, { bucket: 'companies', type: 'ephemeral', sql: 'INSERT' })
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
            expect(resp.success).to.eql(true);
            return retry(() => verifySpans(agentControls, controls, { sql: 'GETANDTOUCH' }));
          }));

      it('[crud] must trace replace', () =>
        controls
          .sendRequest({
            method: 'post',
            path: `/replace-${apiType}`
          })
          .then(resp => {
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
            expect(resp.success).to.eql(true);
            return retry(() => verifySpans(agentControls, controls, { sql: 'MUTATEIN' }));
          }));

      it('[crud] must trace lookupIn', () =>
        controls
          .sendRequest({
            method: 'get',
            path: `/lookupIn-${apiType}`
          })
          .then(resp => {
            expect(resp.result).to.eql(2);
            return retry(() => verifySpans(agentControls, controls, { sql: 'LOOKUPIN' }));
          }));

      it('[crud] must trace exists', () =>
        controls
          .sendRequest({
            method: 'get',
            path: `/exists-${apiType}`
          })
          .then(resp => {
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
                      sql: 'UPSERTINDEX'
                    })
                  );
                  expectExactlyOneMatching(
                    spans,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      bucket: 'projects',
                      type: 'membase',
                      sql: 'GETINDEX'
                    })
                  );
                  expectExactlyOneMatching(
                    spans,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      bucket: 'projects',
                      type: 'membase',
                      sql: 'GETALLINDEXES'
                    })
                  );
                  expectExactlyOneMatching(
                    spans,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      bucket: '',
                      type: '',
                      sql: 'DROPINDEX'
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
            expect(resp.success).to.eql(true);
            return retry(() =>
              verifySpans(agentControls, controls, {
                spanLength: 9,
                verifyCustom: (entrySpan, spans) => {
                  expectExactlyOneMatching(
                    spans,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      bucket: 'projects',
                      type: 'membase',
                      sql: 'ANALYTICSQUERY'
                    })
                  );
                  expectExactlyNMatching(
                    spans,
                    7,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      bucket: '',
                      type: '',
                      sql: 'ANALYTICSQUERY'
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
                      sql: 'SEARCHQUERY'
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
            expect(resp.success).to.eql(true);

            return retry(() =>
              verifySpans(agentControls, controls, {
                spanLength: 9,
                verifyCustom: (entrySpan, spans) => {
                  expectExactlyOneMatching(
                    spans,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      sql: 'CREATEINDEX'
                    })
                  );
                  expectExactlyOneMatching(
                    spans,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      bucket: 'companies',
                      type: 'ephemeral',
                      sql: 'CREATEINDEX'
                    })
                  );

                  // cluster query
                  expectExactlyNMatching(
                    spans,
                    1,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      bucket: '',
                      type: '',
                      sql: 'QUERY'
                    })
                  );

                  // bucket query success
                  expectExactlyNMatching(
                    spans,
                    1,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      bucket: 'companies',
                      type: 'ephemeral',
                      sql: 'QUERY'
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
                      sql: 'QUERY'
                    })
                  );

                  expectExactlyOneMatching(
                    spans,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      sql: 'DROPINDEX'
                    })
                  );
                  expectExactlyOneMatching(
                    spans,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      bucket: 'companies',
                      type: 'ephemeral',
                      sql: 'DROPINDEX'
                    })
                  );
                  expectExactlyOneMatching(
                    spans,
                    verifyCouchbaseSpan(controls, entrySpan, {
                      bucket: 'companies',
                      type: 'ephemeral',
                      sql: 'GETALLINDEXES'
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
                        sql: 'QUERY'
                      })
                    );
                    expectExactlyOneMatching(
                      spans,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        bucket: '',
                        hostname: connStr2,
                        type: '',
                        sql: 'QUERY'
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
              expect(resp.iteratedItems).to.eql(['test1', 'test2']);

              return retry(() =>
                verifySpans(agentControls, controls, {
                  spanLength: 9,
                  verifyCustom: (entrySpan, spans) => {
                    expectExactlyNMatching(
                      spans,
                      3,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        sql: 'MUTATEIN'
                      })
                    );
                    expectExactlyNMatching(
                      spans,
                      2,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        sql: 'LOOKUPIN'
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
              expect(resp.iteratedItems).to.eql(['test1', 'test2']);

              return retry(() =>
                verifySpans(agentControls, controls, {
                  spanLength: 9,
                  verifyCustom: (entrySpan, spans) => {
                    expectExactlyNMatching(
                      spans,
                      3,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        sql: 'MUTATEIN'
                      })
                    );
                    expectExactlyNMatching(
                      spans,
                      3,
                      verifyCouchbaseSpan(controls, entrySpan, {
                        sql: 'LOOKUPIN'
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
      }

      it('[error] must trace remove', () =>
        controls
          .sendRequest({
            method: 'post',
            path: `/remove-${apiType}?error=true`
          })
          .then(resp => {
            expect(resp.errMsg).to.eql(apiType === 'promise' ? 'invalid argument' : 'document not found');

            return retry(() =>
              verifySpans(agentControls, controls, {
                sql: 'REMOVE',
                error: apiType === 'promise' ? 'invalid argument' : 'document not found'
              })
            );
          }));

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
