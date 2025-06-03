/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { expect } = require('chai');
const disabler = require('../../src/util/disableInstrumentation');

describe('isInstrumentationDisabled()', () => {
  const testModules = {
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
    // Reset to default state before each test
    disabler.init({ tracing: { disabledTracers: [] } });
    disabler.activate({ tracing: {} });
  });

  describe('Global tracer disabling', () => {
    it('should disable by module path match', () => {
      disabler.init({
        tracing: {
          disabledTracers: ['hapi']
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/hapi',
          instrumentationModules: testModules
        })
      ).to.be.true;
    });

    it('should disable by instrumentationName', () => {
      disabler.init({
        tracing: {
          disabledTracers: ['koa']
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/koa',
          instrumentationModules: testModules
        })
      ).to.be.true;
    });

    it('should not disable unlisted modules', () => {
      disabler.init({
        tracing: {
          disabledTracers: ['express']
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/hapi',
          instrumentationModules: testModules
        })
      ).to.be.false;
    });
  });

  describe('Logger category disabling', () => {
    it('should disable specific logger when configured', () => {
      disabler.init({
        tracing: {
          logging: { log4js: { enabled: false } }
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/log4js',
          instrumentationModules: testModules
        })
      ).to.be.true;

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testModules
        })
      ).to.be.false;
    });

    it('should disable all logging when category disabled', () => {
      disabler.init({
        tracing: {
          logging: { enabled: false }
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testModules
        })
      ).to.be.true;

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/log4js',
          instrumentationModules: testModules
        })
      ).to.be.true;
    });
  });

  describe('Framework category disabling', () => {
    it('should disable all frameworks when category disabled', () => {
      disabler.init({
        tracing: {
          frameworks: { enabled: false }
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/hapi',
          instrumentationModules: testModules
        })
      ).to.be.true;

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/koa',
          instrumentationModules: testModules
        })
      ).to.be.true;
    });

    it('should not affect logging when frameworks disabled', () => {
      disabler.init({
        tracing: {
          frameworks: { enabled: false }
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testModules
        })
      ).to.be.false;
    });
  });

  describe('Configuration precedence', () => {
    it('should use agent config when main config empty', () => {
      disabler.init({ tracing: {} });
      disabler.activate({
        tracing: {
          logging: { bunyan: { enabled: false } }
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testModules
        })
      ).to.be.true;
    });

    it('should prefer main config over agent config', () => {
      disabler.init({
        tracing: {
          logging: { bunyan: { enabled: true } }
        }
      });
      disabler.activate({
        tracing: {
          logging: { bunyan: { enabled: false } }
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/logging/bunyan',
          instrumentationModules: testModules
        })
      ).to.be.false;
    });
  });

  describe('Edge cases', () => {
    it('should handle missing instrumentationModules', () => {
      disabler.init({
        tracing: {
          disabledTracers: ['hapi']
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './instrumentation/frameworks/hapi'
        })
      ).to.be.true;
    });

    it('should handle custom instrumentation paths', () => {
      disabler.init({
        tracing: {
          disabledTracers: ['custom-module']
        }
      });

      expect(
        disabler.isInstrumentationDisabled({
          instrumentationKey: './custom/path/custom-module',
          instrumentationModules: testModules
        })
      ).to.be.true;
    });
  });
});
