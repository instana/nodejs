/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const sinon = require('sinon');
const semver = require('semver');
const expect = require('chai').expect;
const instana = require('@_local/aws-lambda');
const supportedVersion = require('@_local/core').tracing.supportedVersion;

describe('esm wrapper', function () {
  if (!supportedVersion(process.versions.node)) {
    const majorNodeVersion = semver.major(process.versions.node);

    it(`should throw error for Node v${majorNodeVersion}`, () => {
      try {
        require('../esm/index');
      } catch (e) {
        expect(e.message).to.eql(
          `Your Lambda function is using ${majorNodeVersion}.` +
            "Please use the 'instana-aws-lambda-auto-wrap.handler' as runtime handler."
        );
      }
    });

    return;
  }

  before(() => {
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    Module.prototype.require = function fakeRequire(path) {
      if (path === '/var/runtime/Errors.js') {
        class HandlerNotFound extends Error {}
        class MalformedHandlerName extends Error {}
        class UserCodeSyntaxError extends Error {}
        class ImportModuleError extends Error {}

        const lambdaRuntimeErrors = {
          HandlerNotFound,
          MalformedHandlerName,
          UserCodeSyntaxError,
          ImportModuleError
        };

        return lambdaRuntimeErrors;
      }

      return originalRequire.apply(this, arguments);
    };
  });

  beforeEach(() => {
    sinon.stub(instana, 'wrap').callsFake(function fake(originalHandler) {
      return function fakeWrapper() {
        return originalHandler.apply(this, arguments);
      };
    });
  });

  afterEach(() => {
    sinon.restore();
    delete process.env.LAMBDA_TASK_ROOT;
    delete process.env.LAMBDA_HANDLER;
    delete process.env.LAMBDA_HANDLER;

    delete require.cache[require.resolve('../esm/index')];
  });

  it('should not successfully import a module which does not exist', async () => {
    process.env.LAMBDA_TASK_ROOT = 'test/functions/doesnotexist';

    try {
      const wrapper = require('../esm/index');
      await wrapper.handler();
    } catch (e) {
      expect(e.message).to.contain("Cannot find module 'index'");
    }

    expect(instana.wrap.called).to.be.false;
  });

  it('should not successfully import an ES module', async () => {
    process.env.LAMBDA_TASK_ROOT = 'test/functions/esm-1';
    process.env.LAMBDA_HANDLER = 'server.handler';

    try {
      const wrapper = require('../esm/index');
      await wrapper.handler();
    } catch (e) {
      expect(e.message).to.eql('SyntaxError: Cannot use import statement outside a module');
    }

    expect(instana.wrap.called).to.be.false;
  });

  it('should successfully import an ES module', async () => {
    process.env.LAMBDA_TASK_ROOT = 'test/functions/esm-2';

    const wrapper = require('../esm/index');
    const result = await wrapper.handler();
    expect(result).to.eql(200);
    expect(instana.wrap.called).to.be.true;
  });

  it('should successfully import an ES module', async () => {
    process.env.LAMBDA_TASK_ROOT = 'test/functions/esm-3';

    const wrapper = require('../esm/index');
    const result = await wrapper.handler();
    expect(result).to.eql(200);
    expect(instana.wrap.called).to.be.true;
  });

  it('should not successfully import an ES module', async () => {
    process.env.LAMBDA_TASK_ROOT = 'test/functions/esm-4';

    try {
      const wrapper = require('../esm/index');
      await wrapper.handler();
    } catch (e) {
      expect(e.message).to.contain('handler is undefined or not exported');
    }

    expect(instana.wrap.called).to.be.false;
  });

  it('should successfully import a CJS module', async () => {
    process.env.LAMBDA_TASK_ROOT = 'test/functions/cjs-1';

    const wrapper = require('../esm/index');
    const result = await wrapper.handler();
    expect(result).to.eql(200);
    expect(instana.wrap.called).to.be.true;
  });

  it('should successfully import a CJS module', async () => {
    process.env.LAMBDA_TASK_ROOT = 'test/functions/cjs-2';

    const wrapper = require('../esm/index');
    const result = await wrapper.handler();
    expect(result).to.eql(200);
    expect(instana.wrap.called).to.be.true;
  });

  it('should successfully import a CJS module', async () => {
    process.env.LAMBDA_TASK_ROOT = 'test/functions/cjs-3';
    process.env.LAMBDA_HANDLER = 'server.handler';

    const wrapper = require('../esm/index');
    const result = await wrapper.handler();
    expect(result).to.eql(200);
    expect(instana.wrap.called).to.be.true;
  });
});
