'use strict';

const expect = require('chai').expect;
const uuid = require('uuid/v4');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const utils = require('../../../../../core/test/utils');

describe('tracing/mongoose', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');
  const MongooseControls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const mongooseControls = new MongooseControls({
    agentControls
  });
  mongooseControls.registerTestHooks();

  it('must trace create calls', () =>
    mongooseControls
      .sendRequest({
        method: 'POST',
        path: '/insert',
        body: {
          name: 'Some Body',
          age: 999
        }
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(mongooseControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(mongooseControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.mongo.command).to.equal('insert');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('mongoose.people');
            });
          })
        )
      ));

  it('must trace findOne calls', () => {
    const randomName = uuid();
    return mongooseControls
      .sendRequest({
        method: 'POST',
        path: '/insert',
        body: {
          name: randomName,
          age: 42
        }
      })
      .then(() =>
        mongooseControls.sendRequest({
          method: 'POST',
          path: '/find',
          body: {
            name: randomName,
            age: 42
          }
        })
      )
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.data.http.url).to.equal('/find');
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(mongooseControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
            });

            utils.expectOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(mongooseControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.mongo.command).to.equal('find');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('mongoose.people');
              expect(span.data.mongo.filter).to.contain('"age":42');
              expect(span.data.mongo.filter).to.contain(`"name":"${randomName}"`);
            });
          })
        )
      );
  });
});
