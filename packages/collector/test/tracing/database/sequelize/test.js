/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { expect } = require('chai');
const semver = require('semver');
const { fail } = require('chai').assert;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

// There is no official sequelize release with support for Node.js >= 20 yet. It seems to be work in progress though:
// https://github.com/sequelize/sequelize/releases/tag/v7.0.0-alpha.27
// Once there is an official 7.0.0 release, we can switch to it and remove the restriction to skip the sequelize tests
// in Node.js 20.
const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.lt(process.versions.node, '20.0.0') ? describe : describe.skip;

mochaSuiteFn('tracing/sequelize', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  describe('with pg', function () {
    registerTests.call(this, false);
  });

  describe('with pg-native', function () {
    registerTests.call(this, true);
  });
});

function registerTests(usePgNative) {
  const env = usePgNative
    ? {
        USE_PG_NATIVE: true
      }
    : {};
  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env
    });

    await controls.startAndWaitForAgentConnection();
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

  it(`must fetch (pg-native: ${usePgNative})`, () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/regents'
      })
      .then(response => {
        expect(response).to.exist;
        expect(Array.isArray(response)).to.be.true;
        expect(response.length).to.be.gte(1);
        expect(response[0].firstName).to.equal('Irene');
        expect(response[0].lastName).to.equal('Sarantapechaina');

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, 'GET', '/regents');
            verifyPgExit(spans, httpEntry, /SELECT "firstName", "lastName" FROM "regents" AS "regent";/);
          })
        );
      }));

  it(`must write (pg-native: ${usePgNative})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/regents',
        body: JSON.stringify({
          firstName: 'Martina',
          lastName: '-'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(() =>
        controls.sendRequest({
          method: 'GET',
          path: '/regents?firstName=Martina'
        })
      )
      .then(response => {
        expect(response).to.exist;
        expect(Array.isArray(response)).to.be.true;
        expect(response.length).to.be.gte(1);
        expect(response[0].firstName).to.equal('Martina');
        expect(response[0].lastName).to.equal('-');
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntryWrite = verifyHttpEntry(spans, 'POST', '/regents');
            const httpEntryRead = verifyHttpEntry(spans, 'GET', '/regents');

            verifyPgExit(spans, httpEntryWrite, /^START TRANSACTION;$/);
            verifyPgExit(
              spans,
              httpEntryWrite,
              // eslint-disable-next-line max-len
              /^SELECT .* FROM "regents" AS "regent" WHERE "regent"."firstName" = 'Martina' AND "regent"."lastName" = '-' LIMIT 1;$/
            );
            verifyPgExit(spans, httpEntryWrite, /^CREATE OR REPLACE FUNCTION .*$/);
            verifyPgExit(spans, httpEntryWrite, /^COMMIT;$/);

            verifyPgExit(
              spans,
              httpEntryRead,
              /^SELECT .* FROM "regents" AS "regent" WHERE "regent"."firstName" = 'Martina';$/
            );

            // verify there are no extraneous child PG exits
            const allPgExitsFromWrite = spans.filter(s => s.n === 'postgres' && s.t === httpEntryWrite.t);
            expect(allPgExitsFromWrite).to.have.lengthOf(4);
            const allPgExitsFromRead = spans.filter(s => s.n === 'postgres' && s.t === httpEntryRead.t);
            expect(allPgExitsFromRead).to.have.lengthOf(1);
          })
        );
      }));

  it(`must not associate unrelated HTTP calls with long query span (pg-native: ${usePgNative})`, () => {
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
        expect(response).to.exist;
        expect(Array.isArray(response)).to.be.true;
        expect(response.length).to.be.gte(1);
        expect(response[0].now).to.exist;

        let spans;
        return testUtils
          .retry(() =>
            agentControls.getSpans().then(_spans => {
              spans = _spans;
              expect(spans).to.not.be.empty;
            })
          )
          .then(() => {
            const httpEntryLong = verifyHttpEntry(spans, 'GET', '/long-running-query');
            const httpEntriesQuick = [];
            httpEntriesQuick[0] = verifyUniqueHttpEntry(spans, 'GET', '/quick-query', httpEntriesQuick);
            httpEntriesQuick[1] = verifyUniqueHttpEntry(spans, 'GET', '/quick-query', httpEntriesQuick);
            httpEntriesQuick[2] = verifyUniqueHttpEntry(spans, 'GET', '/quick-query', httpEntriesQuick);

            const allPgExitsFromLongQuery = spans.filter(s => s.n === 'postgres' && s.t === httpEntryLong.t);
            expect(allPgExitsFromLongQuery).to.have.lengthOf(1);
            for (let i = 0; i < httpEntriesQuick.length; i++) {
              const allPgExitsFromQuickQuery = spans.filter(
                s =>
                  s.n === 'postgres' && //
                  s.t === httpEntriesQuick[i].t &&
                  s.data.pg.stmt.indexOf('SET client_min_messages TO warning') < 0 &&
                  s.data.pg.stmt.indexOf('SELECT typname, typtype, oid, typarray FROM pg_type') < 0
              );
              expect(allPgExitsFromQuickQuery).to.have.lengthOf(1);
            }
          });
      });
  });

  it(`must not associate unrelated non-traced calls with long query span (pg-native: ${usePgNative})`, () => {
    setTimeout(() => {
      controls.sendViaIpc('trigger-quick-query');
      setTimeout(() => {
        controls.sendViaIpc('trigger-quick-query');
        setTimeout(() => {
          controls.sendViaIpc('trigger-quick-query');
        }, 200);
      }, 200);
    }, 500);

    return controls
      .sendRequest({
        method: 'GET',
        path: '/long-running-query'
      })
      .then(response => {
        expect(response).to.exist;
        expect(Array.isArray(response)).to.be.true;
        expect(response.length).to.be.gte(1);
        expect(response[0].now).to.exist;

        const ipcMessages = controls.getIpcMessages();
        expect(ipcMessages).to.be.an('array');
        expect(ipcMessages).to.have.lengthOf(3);
        for (let i = 0; i < ipcMessages.length; i++) {
          expect(ipcMessages[i]).to.be.an('array');
          expect(ipcMessages[i]).to.have.lengthOf(1);
          expect(ipcMessages[i][0]).to.be.an('object');
          expect(ipcMessages[i][0].now).to.exist;
        }

        let spans;
        return testUtils
          .retry(() =>
            agentControls.getSpans().then(_spans => {
              spans = _spans;
              expect(spans).to.not.be.empty;
            })
          )
          .then(() => {
            const httpEntryLong = verifyHttpEntry(spans, 'GET', '/long-running-query');
            const allPgExitsFromLongQuery = spans.filter(s => s.n === 'postgres' && s.t === httpEntryLong.t);
            expect(allPgExitsFromLongQuery).to.have.lengthOf(1);

            if (spans.length > 2) {
              // eslint-disable-next-line no-console
              console.log('Extraneous spans:', JSON.stringify(spans, null, 2));
              fail('Found extraneous spans');
            }
          });
      });
  });

  function verifyHttpEntry(spans, method, url) {
    return testUtils.expectAtLeastOneMatching(spans, [
      span => expect(span.p).to.not.exist,
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.data.http.method).to.equal(method),
      span => expect(span.data.http.url).to.equal(url)
    ]);
  }

  function verifyUniqueHttpEntry(spans, method, url, other) {
    return testUtils.expectAtLeastOneMatching(spans, span => {
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

  function verifyPgExit(spans, parent, statement) {
    return testUtils.expectAtLeastOneMatching(spans, span => {
      expect(span.n).to.equal('postgres');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.t).to.equal(parent.t);
      expect(span.p).to.equal(parent.s);
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.data).to.exist;
      expect(span.data.pg).to.exist;
      if (typeof statement === 'string') {
        expect(span.data.pg.stmt).to.equal(statement);
      } else {
        expect(span.data.pg.stmt).to.match(statement);
      }
    });
  }

  // eslint-disable-next-line no-unused-vars
  function logSortedSpans(spans) {
    const sortedSpans = spans
      .sort((s1, s2) => {
        if (s1.t < s2.t) {
          return -1;
        } else if (s1.t > s2.t) {
          return 1;
        } else {
          return s1.ts - s2.ts;
        }
      })
      .map(s => ({
        trace: s.t,
        span: s.s,
        parent: s.p,
        name: s.n,
        time: new Date(s.ts),
        duration: s.d,
        action: s.data.http ? `${s.data.http.method} ${s.data.http.url}` : s.data.pg.stmt
      }));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(sortedSpans, null, 2));
  }
}
