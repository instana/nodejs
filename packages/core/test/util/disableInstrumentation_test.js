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
    './instrumentation/logging/log4js': {
      init: () => {},
      activate: () => {},
      deactivate: () => {},
      instrumentationName: 'log4js'
    }
  };

  beforeEach(() => {
    disableInstrumentation.init({ tracing: { disabledTracers: [] } });
    disableInstrumentation.activate({ tracing: {} });
  });

  describe('when disabled via disabledTracers config', () => {
    it('should disable by module path match', () => {
      disableInstrumentation.init({
        tracing: {
          disabledTracers: ['hapi']
        }
      });

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/hapi',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.true;
    });

    it('should disable by package name', () => {
      disableInstrumentation.init({
        tracing: {
          disabledTracers: ['koa']
        }
      });

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/koa',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.true;
    });

    it('should not disable packages not mentioned in config', () => {
      disableInstrumentation.init({
        tracing: {
          disabledTracers: ['express']
        }
      });

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/hapi',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.false;
    });
  });

  describe('when disabled based on category', () => {
    it('should disable specific logging category when configured', () => {
      disableInstrumentation.init({
        tracing: {
          logging: { log4js: { disable: true } }
        }
      });

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/log4js',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.true;

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.false;
    });

    it('should disable all logging when category is configured', () => {
      disableInstrumentation.init({
        tracing: {
          logging: { disable: true }
        }
      });

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.true;

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/log4js',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.true;
    });

    it('should not disable frameworks when category disabled', () => {
      disableInstrumentation.init({
        tracing: {
          frameworks: { disable: true }
        }
      });

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/hapi',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.false;

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/koa',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.false;
    });

    it('should not affect logging when frameworks disabled', () => {
      disableInstrumentation.init({
        tracing: {
          frameworks: { disable: true }
        }
      });

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.false;
    });

    it('should use agent config when service specific config empty', () => {
      disableInstrumentation.init({ tracing: {} });
      disableInstrumentation.activate({
        tracing: {
          logging: { bunyan: { disable: true } }
        }
      });

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.true;
    });

    it('should prefer service specific config over agent config', () => {
      disableInstrumentation.init({
        tracing: {
          logging: { disable: true }
        }
      });
      disableInstrumentation.activate({
        tracing: {
          logging: { bunyan: { disable: true } }
        }
      });

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.true;
      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/log4js',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.true;
    });

    it('should use service specific config', () => {
      disableInstrumentation.init({
        tracing: {
          logging: { bunyan: { disable: true } }
        }
      });
      disableInstrumentation.activate({
        tracing: {
          logging: {}
        }
      });

      expect(
        disableInstrumentation.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testInstrumentationModules
        })
      ).to.be.true;
    });
  });
});
