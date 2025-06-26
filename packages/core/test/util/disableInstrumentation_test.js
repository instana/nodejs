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

  describe('when disabling based on instrumentations', () => {
    it('should disable instrumentation when exact instrumentation matches disable service config', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { instrumentations: ['console'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });

    it('should disable instrumentation when instrumentation matches disable list via agent config', () => {
      disableInstrumentation.activate({
        tracing: {
          disable: { instrumentations: ['aws/v3'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/cloud/aws/v3/s3',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });

    it('should disable instrumentation when instrumentationName matches disable config', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { instrumentations: ['aws/v3'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/cloud/aws/v3/s3',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });

    it('should not disable instrumentation when neither module nor instrumentationName matches', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { instrumentations: ['console'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/bunyan',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.false;
    });

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

    it('should handle instrumentations that do not exist in instrumentationModules', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { instrumentations: ['nonexistent'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/nonexistent/module',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.false;
    });

    it('should handle instrumentations without instrumentationName property', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { instrumentations: ['express'] }
        }
      });

      const result = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/frameworks/express',
        instrumentationModules: testInstrumentationModules
      });
      expect(result).to.be.true;
    });
  });

  describe('when disabling based on instrumentation groups', () => {
    it('should disable all instrumentations within a group when group is disabled via service config', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { groups: ['logging'] }
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

    it('should disable all instrumentations within a group when group is disabled via agent config', () => {
      disableInstrumentation.activate({
        tracing: {
          disable: { groups: ['logging'] }
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

    it('should not disable instrumentations in groups not listed in disable config', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { groups: ['frameworks'] }
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

    it('should handle group and specific instrumentation in it', () => {
      // e.g. when we want to disable bunyan but not console
      // this config now only coming from agent
      disableInstrumentation.init({
        tracing: {
          disable: { groups: ['logging'], instrumentations: ['console'] }
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

    it('should handle unsupported group disabling', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { groups: ['frameworks', 'logging'] }
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

  // case where config coming from agent
  describe('When the config contain both enable and disable', () => {
    it('should handle when category is disabled and specific module enabled', () => {
      disableInstrumentation.init({});
      disableInstrumentation.activate({
        tracing: {
          disable: { groups: ['logging'], instrumentations: ['!console'] }
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
      expect(consoleResult).to.be.false;
    });

    it('should prioritize enabling over disabling for instrumentations', () => {
      disableInstrumentation.init({});
      disableInstrumentation.activate({
        tracing: {
          disable: { instrumentations: ['!console', 'console'] }
        }
      });

      const consoleResult = disableInstrumentation.isInstrumentationDisabled({
        instrumentationKey: './instrumentation/logging/console',
        instrumentationModules: testInstrumentationModules
      });

      expect(consoleResult).to.be.false;
    });

    it('should disable specific instrumentation even if group is enabled', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { groups: ['!logging'], instrumentations: ['console'] }
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
      expect(bunyanResult).to.be.false;
    });

    it('should enable group if group is explicitly enabled', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { groups: ['!logging'] }
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

      expect(consoleResult).to.be.false;
      expect(bunyanResult).to.be.false;
    });

    it('should priotize enable config over disable config in case of groups', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { groups: ['logging', '!logging'] }
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

      expect(consoleResult).to.be.false;
      expect(bunyanResult).to.be.false;
    });
  });

  describe('configuration precedence', () => {
    it('should prioritize service configuration over agent configuration when both are present', () => {
      disableInstrumentation.init({
        tracing: {
          disable: { instrumentations: ['console'] }
        }
      });
      disableInstrumentation.activate({
        tracing: {
          disable: { instrumentations: ['console'] }
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
          disable: { instrumentations: ['console'] }
        }
      });
      disableInstrumentation.activate({
        tracing: {
          disable: { instrumentations: ['bunyan'] }
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
          disable: { instrumentations: ['console'] }
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
          disable: { instrumentations: ['console'] }
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
});
