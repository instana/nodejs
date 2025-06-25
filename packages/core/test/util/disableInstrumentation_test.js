/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { expect } = require('chai');
const disableInstrumentation = require('../../src/util/disableInstrumentation');

describe('util.disableInstrumentation', () => {
  const testInstrumentationModules = {
    './instrumentation/frameworks/hapi': {
      init: () => {},
      activate: () => {},
      deactivate: () => {},
      instrumentationName: 'hapi'
    },
    './instrumentation/frameworks/koa': {
      init: () => {},
      activate: () => {},
      deactivate: () => {},
      instrumentationName: 'koa'
    },
    './instrumentation/logging/bunyan': {
      init: () => {},
      activate: () => {},
      deactivate: () => {},
      instrumentationName: 'bunyan'
    },
    './instrumentation/frameworks/express': {
      instrumentationName: 'express'
    },
    './instrumentation/databases/mongodb': {
      instrumentationName: 'mongodb'
    },
    './instrumentation/cloud/aws/v3/s3': {
      init: () => {},
      activate: () => {},
      deactivate: () => {},
      instrumentationName: 'aws/v3'
    },
    './instrumentation/logging/console': {
      instrumentationName: 'console'
    }
  };

  beforeEach(() => {
    disableInstrumentation.init({});
    disableInstrumentation.activate({});
  });

  describe('Module name matching functionality', () => {
    it('should disable instrumentation when exact module name matches disable list entry', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { libraries: ['console'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });

    it('should disable instrumentation when instrumentationName matches disable list via agent config', () => {
      disableInstrumentation.activate({
        tracing: {
          disable: { libraries: ['aws/v3'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/cloud/aws/v3/s3',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });

    it('should disable instrumentation when instrumentationName matches disable list', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { libraries: ['aws/v3'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/cloud/aws/v3/s3',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });

    it('should not disable instrumentation when neither module path nor instrumentationName matches', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { libraries: ['console'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/bunyan',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.false;
    });

    it('should handle module paths with different levels of nesting', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { libraries: ['mongodb'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/databases/mongodb',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });
  });

  describe('Category-based disabling behavior', () => {
    it('should disable all modules within a category when category is disabled via service config', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { categories: ['logging'] }
        }
      });

      const consoleResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });
      const bunyanResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/bunyan',
        instrumentationModules: testInstrumentationModules
      });

      expect(consoleResult).to.be.true;
      expect(bunyanResult).to.be.true;
    });

    it('should disable all modules within a category when category is disabled via agent config', () => {
      disableInstrumentation.activate({
        tracing: {
          disable: { categories: ['logging'] }
        }
      });

      const consoleResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });
      const bunyanResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/bunyan',
        instrumentationModules: testInstrumentationModules
      });

      expect(consoleResult).to.be.true;
      expect(bunyanResult).to.be.true;
    });

    it('should not disable modules in categories not listed in disable configuration', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { categories: ['frameworks'] }
        }
      });

      const dbResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/databases/mongodb',
        instrumentationModules: testInstrumentationModules
      });
      const loggingResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/bunyan',
        instrumentationModules: testInstrumentationModules
      });

      expect(dbResult).to.be.false;
      expect(loggingResult).to.be.false;
    });

    it('should handle mixed category and specific module disabling', () => {
      // e.g. when we want to disable bunyan but not console
      // this config now only coming from agent
      disableInstrumentation.init({
        tracing: {
          disable: { categories: ['logging'], libraries: ['console'] }
        }
      });

      const bunyanesult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/bunyan',
        instrumentationModules: testInstrumentationModules
      });
      const consoleResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });

      expect(bunyanesult).to.be.true;
      expect(consoleResult).to.be.true;
    });

    it('should handle unsupported category disabling', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { categories: ['frameworks', 'logging'] }
        }
      });

      const frameworkResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/frameworks/koa',
        instrumentationModules: testInstrumentationModules
      });
      const loggingResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });

      expect(frameworkResult).to.be.false;
      expect(loggingResult).to.be.true;
    });
  });

  describe('Configuration precedence rules', () => {
    it('should prioritize service configuration over agent configuration when both are present', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { libraries: ['console'] }
        }
      });
      disableInstrumentation.activate({
        tracing: {
          disable: { libraries: ['!console'] }
        }
      });

      const consoleResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });

      expect(consoleResult).to.be.true;
    });

    it('should accept service configuration and agent configuration when both are present', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { libraries: ['console'] }
        }
      });
      disableInstrumentation.activate({
        tracing: {
          disable: { libraries: ['bunyan'] }
        }
      });

      const consoleResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });
      const bunyanResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/bunyan',
        instrumentationModules: testInstrumentationModules
      });

      expect(consoleResult).to.be.true;
      expect(bunyanResult).to.be.true;
    });

    it('should use agent configuration when service configuration is empty', () => {
      disableInstrumentation.init({});
      disableInstrumentation.activate({
        tracing: {
          disable: { libraries: ['console'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });

    it('should use service configuration when agent configuration is empty', () => {
      disableInstrumentation.init({});
      disableInstrumentation.activate({
        tracing: {
          disable: { libraries: ['console'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });

    it('should not disable any instrumentation when both configurations are empty', () => {
      disableInstrumentation.init({});
      disableInstrumentation.activate({});

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.false;
    });
  });

  describe('Edge cases', () => {
    it('should handle empty disable list', () => {
      disableInstrumentation.init({
        tracing: {
          disable: []
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.false;
    });

    it('should handle undefined disable configuration', () => {
      disableInstrumentation.init({});

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.false;
    });

    it('should handle module paths that do not exist in instrumentationModules', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { libraries: ['nonexistent'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/nonexistent/module',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.false;
    });

    it('should handle modules without instrumentationName property', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { libraries: ['express'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/frameworks/express',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });
  });
});
