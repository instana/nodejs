/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('shimmer');
const cls = require('../../../cls');
const { EXIT, isExitSpan } = require('../../../constants');
const requireHook = require('../../../../util/requireHook');
const tracingUtil = require('../../../tracingUtil');

const s3MethodsInfo = {
  listBuckets: {
    op: 'list',
    hasKey: false
  },
  createBucket: {
    op: 'createBucket',
    hasKey: false
  },
  deleteBucket: {
    op: 'deleteBucket',
    hasKey: false
  },
  headObject: {
    op: 'metadata',
    hasKey: true
  },
  putObject: {
    op: 'put',
    hasKey: true
  },
  deleteObject: {
    op: 'delete',
    hasKey: true
  },
  getObject: {
    op: 'get',
    hasKey: true
  },
  listObjects: {
    op: 'list',
    hasKey: false
  },
  listObjectsV2: {
    op: 'list',
    hasKey: false
  }
};

const methodList = Object.keys(s3MethodsInfo);

let isActive = false;

exports.init = function init() {
  requireHook.onModuleLoad('aws-sdk', instrumentAWS);
};

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

function instrumentAWS(AWS) {
  shimmer.wrap(AWS.Service.prototype, 'makeRequest', shimMakeRequest);
  shimmer.wrap(AWS.Request.prototype, 'promise', shimRequestPromise);
}

function shimMakeRequest(originalMakeRequest) {
  return function () {
    if (isActive) {
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < originalArgs.length; i++) {
        originalArgs[i] = arguments[i];
      }

      return instrumentedMakeRequest(this, originalMakeRequest, originalArgs);
    }

    return originalMakeRequest.apply(this, arguments);
  };
}

function instrumentedMakeRequest(ctx, originalMakeRequest, originalArgs) {
  /**
   * Original args for ALL AWS SDK Requets: [method, params, callback]
   */

  if (!isOperationShimmable(originalArgs[0]) || typeof originalArgs[2] !== 'function') {
    return originalMakeRequest.apply(ctx, originalArgs);
  }

  if (cls.tracingSuppressed()) {
    return originalMakeRequest.apply(ctx, originalArgs);
  }

  const parentSpan = cls.getCurrentSpan();

  if (!parentSpan || isExitSpan(parentSpan)) {
    return originalMakeRequest.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('s3', EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedMakeRequest);
    span.data.s3 = buildS3Data(originalArgs[0], originalArgs[1]);

    const _originalCallback = originalArgs[2];

    originalArgs[2] = cls.ns.bind(function (err, data) {
      finishSpan(err, data, span);
      return _originalCallback.apply(this, arguments);
    });

    return originalMakeRequest.apply(ctx, originalArgs);
  });
}

function shimRequestPromise(originalPromise) {
  return function shimmedPromise() {
    if (isActive && isOperationShimmable(this.operation)) {
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < originalArgs.length; i++) {
        originalArgs[i] = arguments[i];
      }

      return instrumentedRequestPromise(this, originalPromise, originalArgs);
    }
    return originalPromise.apply(this, arguments);
  };
}

function instrumentedRequestPromise(ctx, originalPromise, originalArgs) {
  if (cls.tracingSuppressed()) {
    return originalPromise.apply(ctx, originalArgs);
  }

  if (!isOperationShimmable(ctx.operation)) {
    return originalPromise.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(function () {
    const span = cls.startSpan('s3', EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedRequestPromise);
    const _promise = originalPromise;

    originalPromise = cls.ns.bind(function patchedPromise() {
      span.data.s3 = buildS3Data(ctx.operation, ctx.params);

      return new Promise((resolve, reject) => {
        _promise
          .apply(ctx, arguments)
          .then(data => {
            resolve(data);
            finishSpan(null, data, span);
          })
          .catch(err => {
            reject(err);
            finishSpan(err, null, span);
          });
      });
    });

    return originalPromise.apply(ctx, originalArgs);
  });
}

function finishSpan(err, _data, span) {
  if (err) {
    addErrorToSpan(err, span);
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

function addErrorToSpan(err, span) {
  if (err) {
    span.ec = 1;
    span.data.s3.error = err.message || err.code || JSON.stringify(err);
  }
}

function buildS3Data(methodName, params) {
  const methodInfo = s3MethodsInfo[methodName];
  const s3Data = {
    op: methodInfo.op
  };

  if (params && params.Bucket) {
    s3Data.bucket = params.Bucket;
  }

  if (methodInfo.hasKey) {
    s3Data.key = params.Key;
  }

  return s3Data;
}

function isOperationShimmable(operation) {
  return methodList.includes(operation);
}
