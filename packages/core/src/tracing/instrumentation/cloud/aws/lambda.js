/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('shimmer');
const requireHook = require('../../../../util/requireHook');
const cls = require('../../../cls');
const { EXIT, isExitSpan } = require('../../../constants');
const tracingUtil = require('../../../tracingUtil');

const MAX_CONTEXT_SIZE = 3582;

const operationsInfo = {
  invoke: { op: 'invoke' },
  invokeAsync: { op: 'invokeAsync' }
};

const methodList = Object.keys(operationsInfo);

let isActive = false;

exports.isActive = function () {
  return isActive;
};

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
  if (!isOperationShimmable(originalArgs[0]) || cls.tracingSuppressed()) {
    return originalMakeRequest.apply(ctx, originalArgs);
  }

  const parentSpan = cls.getCurrentSpan();

  if (!parentSpan || isExitSpan(parentSpan)) {
    return originalMakeRequest.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('aws.sdk.invoke', EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedMakeRequest);
    span.data.invoke = buildSpanData(originalArgs[0], originalArgs[1]);

    /** @type {import('aws-sdk').Lambda.Types.InvocationRequest | import('aws-sdk').Lambda.Types.InvokeAsyncRequest} */
    const params = originalArgs[1];
    let clientContextContentBase64;
    let clientContextContentJSON;
    let isJSON = true;

    const instanaCustomHeaders = {
      Custom: {
        'X-INSTANA-L': '',
        'X-INSTANA-S': '',
        'X-INSTANA-T': '',
        TRACEPARENT: '',
        TRACESTATE: ''
      }
    };

    if (params.ClientContext != null) {
      clientContextContentBase64 = Buffer.from(params.ClientContext, 'base64').toString();

      try {
        clientContextContentJSON = JSON.parse(clientContextContentBase64);
        clientContextContentJSON.Custom = instanaCustomHeaders.Custom;
      } catch (err) {
        // ClientContext has a value that is not JSON, then we cannot add Instana headers
        isJSON = false;
      }
    } else {
      clientContextContentJSON = instanaCustomHeaders;
    }

    if (isJSON) {
      clientContextContentBase64 = Buffer.from(JSON.stringify(clientContextContentJSON), 'utf8').toString('base64');

      if (clientContextContentBase64.length <= MAX_CONTEXT_SIZE) {
        params.ClientContext = clientContextContentBase64;
      }
    }

    if (typeof originalArgs[2] === 'function') {
      // callback case
      const _originalCallback = originalArgs[2];

      originalArgs[2] = cls.ns.bind(function (err, data) {
        if (data && data.code) {
          finishSpan(data, span);
        } else {
          finishSpan(err, span);
        }
        return _originalCallback.apply(this, arguments);
      });
    }

    const request = originalMakeRequest.apply(ctx, originalArgs);

    if (typeof request.promise === 'function' && typeof originalArgs[2] !== 'function') {
      // promise case
      const originalPromise = request.promise;

      request.promise = cls.ns.bind(function () {
        const promise = originalPromise.apply(request, arguments);
        return promise
          .then(data => {
            if (data && data.code) {
              finishSpan(data, span);
            } else {
              finishSpan(null, span);
            }

            return data;
          })
          .catch(err => {
            finishSpan(err, span);
            return err;
          });
      });
    }

    return request;
  });
}

function finishSpan(err, span) {
  if (err) {
    addErrorToSpan(err, span);
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

function addErrorToSpan(err, span) {
  if (err) {
    span.ec = 1;
    const lambdaData = span.data && span.data.invoke;
    if (lambdaData) {
      lambdaData.error = err.message || err.code || JSON.stringify(err);
    }
  }
}

function buildSpanData(operation, params) {
  // const operationInfo = operationsInfo[operation];
  const spanData = {
    function: params.FunctionName
  };

  return spanData;
}

function isOperationShimmable(operation) {
  return methodList.includes(operation);
}
