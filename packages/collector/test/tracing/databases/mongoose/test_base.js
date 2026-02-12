/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const { v4: uuid } = require('uuid');

const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const { expectExactlyOneMatching, retry } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const USE_ATLAS = process.env.USE_ATLAS === 'true';

module.exports = function (name, version, isLatest) {
  const timeout = USE_ATLAS ? config.getTestTimeout() * 2 : config.getTestTimeout();
  this.timeout(timeout);

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

  it('must trace create calls', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/insert',
        body: {
          name: 'Some Body',
          age: 999
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans).to.have.lengthOf(2);
            const entrySpan = expectEntry(controls, spans, '/insert');
            expectMongoExit(controls, spans, entrySpan, 'insert');
          })
        )
      ));

  it('must trace findOne calls', () => {
    const randomName = uuid();
    return controls
      .sendRequest({
        method: 'POST',
        path: '/insert',
        body: JSON.stringify({
          name: randomName,
          age: 42
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(() =>
        controls.sendRequest({
          method: 'POST',
          path: '/find',
          body: JSON.stringify({
            name: randomName,
            age: 42
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        })
      )
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans).to.have.lengthOf(4);
            const entrySpan = expectEntry(controls, spans, '/find');
            const mongoExit = expectMongoExit(controls, spans, entrySpan, 'find');
            expect(mongoExit.data.mongo.filter).to.contain('"age":42');
            expect(mongoExit.data.mongo.filter).to.contain(`"name":"${randomName}"`);
          })
        )
      );
  });

  it('must trace aggregate calls', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/aggregate'
      })
      .then(res => {
        expect(res).to.be.an('array');
        const group1 = res.find(o => o._id === 33);
        const group2 = res.find(o => o._id === 77);
        expect(group1.totalCount).to.equal(2);
        expect(group1.totalAge).to.equal(66);
        expect(group2.totalCount).to.equal(1);
        expect(group2.totalAge).to.equal(77);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = expectEntry(controls, spans, '/aggregate');
            const mongoExit = expectMongoExit(controls, spans, entrySpan, 'aggregate');
            expect(mongoExit.data.mongo.json).to.contain('"$match"');
            expect(mongoExit.data.mongo.json).to.contain('"$group"');
            expect(mongoExit.data.mongo.json).to.contain('"$project"');
          })
        );
      }));

  function expectEntry(controls, spans, url) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.data.http.url).to.equal(url),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0)
    ]);
  }

  function expectMongoExit(controls, spans, parent, command) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.equal(parent.t);
      expect(span.p).to.equal(parent.s);
      expect(span.n).to.equal('mongo');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.data.mongo.namespace).to.equal('mongoose.people');
      expect(span.data.mongo.command).to.equal(command);

      if (USE_ATLAS) {
        expect(span.data.peer.hostname).to.include('.mongodb.net');
        expect(span.data.peer.port).to.equal(27017);
        expect(span.data.mongo.service).to.include('.mongodb.net:27017');
      } else {
        expect(span.data.peer.hostname).to.equal('127.0.0.1');
        expect(span.data.peer.port).to.equal(27017);
        expect(span.data.mongo.service).to.equal(process.env.MONGODB);
      }
    });
  }
};
