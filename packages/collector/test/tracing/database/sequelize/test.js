'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const utils = require('../../../../../core/test/utils');

describe('tracing/sequelize', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const controls = require('./controls');
  const agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();
  controls.registerTestHooks();

  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(controls.getPid()));

  it('must fetch', () =>
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

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, 'GET', '/regents');
            verifyPgExit(spans, httpEntry, /SELECT "firstName", "lastName" FROM "regents" AS "regent";/);
          })
        );
      }));

  it('must write', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/regents',
        body: {
          firstName: 'Martina',
          lastName: '-'
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
        return utils.retry(() =>
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

  function verifyHttpEntry(spans, method, url) {
    return utils.expectOneMatching(spans, span => {
      expect(span.p).to.not.exist;
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.n).to.equal('node.http.server');
      expect(span.data.http.method).to.equal(method);
      expect(span.data.http.url).to.equal(url);
    });
  }

  function verifyPgExit(spans, parent, statement) {
    return utils.expectOneMatching(spans, span => {
      expect(span.n).to.equal('postgres');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.t).to.equal(parent.t);
      expect(span.p).to.equal(parent.s);
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      expect(span.error).to.equal(false);
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
});
