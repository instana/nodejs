/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const grpc = require('../../../../../core/src/tracing/instrumentation/protocols/grpc');
const { Metadata } = require('@grpc/grpc-js');

const mochaSuiteFn = semver.satisfies(process.versions.node, '>=8.13.0') ? describe : describe.skip;

mochaSuiteFn('[UNIT] tracing/grpc-js', function () {
  describe('modifyArgs', () => {
    it('makeUnaryRequest', () => {
      const name = 'makeUnaryRequest';
      let originalArgs = [];
      const span = {
        s: 's',
        t: 't'
      };

      const method = 'method';
      const serialize = function serialize() {};
      const deserialize = function deserialize() {};
      const argument = { arg: 1 };
      const metadata = new Metadata();
      metadata.set('remember', 'me');
      const options = { opt: 1 };
      const callback = function cb() {};

      originalArgs = [method, serialize, deserialize, argument, metadata, options, callback];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3]).to.eql({ arg: 1 });
      expect(originalArgs[4].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[4].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[4].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[4].get('remember')).to.eql(['me']);
      expect(originalArgs[5]).to.eql({ opt: 1 });
      expect(originalArgs[6].name).to.eql('clsBind');

      originalArgs = [method, serialize, deserialize, argument, options, callback];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3]).to.eql({ arg: 1 });
      expect(originalArgs[4].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[4].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[4].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[5]).to.eql({ opt: 1 });
      expect(originalArgs[6].name).to.eql('clsBind');

      originalArgs = [method, serialize, deserialize, argument, metadata, callback];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3]).to.eql({ arg: 1 });
      expect(originalArgs[4].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[4].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[4].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[4].get('remember')).to.eql(['me']);
      expect(originalArgs[5]).to.eql({});
      expect(originalArgs[6].name).to.eql('clsBind');

      originalArgs = [method, serialize, deserialize, argument, callback];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3]).to.eql({ arg: 1 });
      expect(originalArgs[4].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[4].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[4].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[5]).to.eql({});
      expect(originalArgs[6].name).to.eql('clsBind');
    });

    it('makeClientStreamRequest', () => {
      const name = 'makeClientStreamRequest';
      let originalArgs = [];
      const span = {
        s: 's',
        t: 't'
      };

      const method = 'method';
      const serialize = function serialize() {};
      const deserialize = function deserialize() {};
      const metadata = new Metadata();
      metadata.set('remember', 'me');
      const options = { opt: 1 };
      const callback = function cb() {};

      originalArgs = [method, serialize, deserialize, metadata, options, callback];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[3].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[3].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[3].get('remember')).to.eql(['me']);
      expect(originalArgs[4]).to.eql({ opt: 1 });
      expect(originalArgs[5].name).to.eql('clsBind');

      originalArgs = [method, serialize, deserialize, options, callback];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[3].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[3].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[3].get('remember')).to.eql([]);
      expect(originalArgs[4]).to.eql({ opt: 1 });
      expect(originalArgs[5].name).to.eql('clsBind');

      originalArgs = [method, serialize, deserialize, metadata, callback];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[3].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[3].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[3].get('remember')).to.eql(['me']);
      expect(originalArgs[4]).to.eql({});
      expect(originalArgs[5].name).to.eql('clsBind');

      originalArgs = [method, serialize, deserialize, callback];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[3].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[3].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[3].get('remember')).to.eql([]);
      expect(originalArgs[4]).to.eql({});
      expect(originalArgs[5].name).to.eql('clsBind');
    });

    it('makeServerStreamRequest', () => {
      const name = 'makeServerStreamRequest';
      let originalArgs = [];
      const span = {
        s: 's',
        t: 't'
      };

      const method = 'method';
      const serialize = function serialize() {};
      const deserialize = function deserialize() {};
      const argument = { arg: 1 };
      const metadata = new Metadata();
      metadata.set('remember', 'me');
      const options = { opt: 1 };

      originalArgs = [method, serialize, deserialize, argument, metadata, options];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3]).to.eql({ arg: 1 });
      expect(originalArgs[4].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[4].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[4].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[4].get('remember')).to.eql(['me']);
      expect(originalArgs[5]).to.eql({ opt: 1 });

      originalArgs = [method, serialize, deserialize, argument, options];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3]).to.eql({ arg: 1 });
      expect(originalArgs[4].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[4].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[4].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[4].get('remember')).to.eql([]);
      expect(originalArgs[5]).to.eql({ opt: 1 });

      originalArgs = [method, serialize, deserialize, argument];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3]).to.eql({ arg: 1 });
      expect(originalArgs[4].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[4].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[4].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[4].get('remember')).to.eql([]);
      expect(originalArgs[5]).to.eql({});
    });

    it('makeBidiStreamRequest', () => {
      const name = 'makeBidiStreamRequest';
      let originalArgs = [];
      const span = {
        s: 's',
        t: 't'
      };

      const method = 'method';
      const serialize = function serialize() {};
      const deserialize = function deserialize() {};
      const argument = { arg: 1 };
      const metadata = new Metadata();
      metadata.set('remember', 'me');
      const options = { opt: 1 };

      originalArgs = [method, serialize, deserialize, argument, metadata, options];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3]).to.eql({ arg: 1 });
      expect(originalArgs[4].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[4].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[4].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[4].get('remember')).to.eql(['me']);
      expect(originalArgs[5]).to.eql({ opt: 1 });

      originalArgs = [method, serialize, deserialize, argument, options];

      grpc.instrumentModule({ Metadata });
      grpc.modifyArgs(name, originalArgs, span);

      expect(originalArgs[0]).to.eql('method');
      expect(originalArgs[1].name).to.eql('serialize');
      expect(originalArgs[2].name).to.eql('deserialize');
      expect(originalArgs[3]).to.eql({ arg: 1 });
      expect(originalArgs[4].get('x-instana-s')).to.eql(['s']);
      expect(originalArgs[4].get('x-instana-t')).to.eql(['t']);
      expect(originalArgs[4].get('x-instana-l')).to.eql(['1']);
      expect(originalArgs[4].get('remember')).to.eql([]);
      expect(originalArgs[5]).to.eql({ opt: 1 });
    });
  });
});
