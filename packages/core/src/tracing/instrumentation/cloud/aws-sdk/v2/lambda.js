/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const cls = require('../../../../cls');
const { EXIT, isExitSpan } = require('../../../../constants');
const tracingUtil = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');

const MAX_CONTEXT_SIZE = 3582;

const SPAN_NAME = 'aws.lambda.invoke';
const operations = ['invoke', 'invokeAsync'];

class InstanaAWSLambda extends InstanaAWSProduct {
  instrumentedMakeRequest(ctx, originalMakeRequest, originalArgs) {
    const parentSpan = cls.getCurrentSpan();
    const self = this;

    if (!parentSpan || isExitSpan(parentSpan)) {
      return originalMakeRequest.apply(ctx, originalArgs);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(SPAN_NAME, EXIT);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedMakeRequest, 1);
      span.data[this.spanName] = this.buildSpanData(originalArgs[0], originalArgs[1]);

      // eslint-disable-next-line
      /** @type {import('aws-sdk').Lambda.Types.InvocationRequest | import('aws-sdk').Lambda.Types.InvokeAsyncRequest} */
      const params = originalArgs[1];
      let clientContextContentBase64;
      let clientContextContentJSON;
      let isJSON = true;

      const instanaCustomHeaders = {
        Custom: {
          'x-instana-l': cls.tracingSuppressed() ? '0' : '1',
          'x-instana-s': span.s,
          'x-instana-t': span.t
        }
      };

      // invokeAsync doesn't have the option ClientContext
      if (originalArgs[0] === 'invoke') {
        if (params.ClientContext != null) {
          clientContextContentBase64 = Buffer.from(params.ClientContext, 'base64').toString();

          try {
            clientContextContentJSON = JSON.parse(clientContextContentBase64);

            if (typeof clientContextContentJSON.Custom === 'object') {
              clientContextContentJSON.Custom['x-instana-l'] = cls.tracingSuppressed() ? '0' : '1';
              clientContextContentJSON.Custom['x-instana-s'] = span.s;
              clientContextContentJSON.Custom['x-instana-t'] = span.t;
            } else {
              clientContextContentJSON.Custom = instanaCustomHeaders.Custom;
            }
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
      }

      if (cls.tracingSuppressed()) {
        return originalMakeRequest.apply(ctx, originalArgs);
      }

      if (typeof originalArgs[2] === 'function') {
        // callback case
        const _originalCallback = originalArgs[2];

        originalArgs[2] = cls.ns.bind(function (err, data) {
          if (data && data.code) {
            self.finishSpan(data, span);
          } else {
            self.finishSpan(err, span);
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
                self.finishSpan(data, span);
              } else {
                self.finishSpan(null, span);
              }

              return data;
            })
            .catch(err => {
              self.finishSpan(err, span);
              return err;
            });
        });
      }

      return request;
    });
  }

  buildSpanData(_operation, params) {
    const spanData = {
      function: params.FunctionName
    };

    if (params.InvocationType) {
      spanData.type = params.InvocationType;
    }

    return spanData;
  }
}

module.exports = new InstanaAWSLambda(SPAN_NAME, operations);
