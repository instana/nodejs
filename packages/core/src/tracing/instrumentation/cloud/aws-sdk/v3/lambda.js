/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const cls = require('../../../../cls');
const { EXIT } = require('../../../../constants');
const tracingUtil = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');

const MAX_CONTEXT_SIZE = 3582;

const SPAN_NAME = 'aws.lambda.invoke';

class InstanaAWSLambda extends InstanaAWSProduct {
  propagateInstanaHeaders(originalArgs, span, suppressed = false) {
    const params = originalArgs[0].input;
    let clientContextContentBase64;
    let clientContextContentJSON;
    let isJSON = true;

    const instanaHeaders = {
      'x-instana-l': suppressed ? '0' : '1'
    };

    if (span) {
      instanaHeaders['x-instana-s'] = span.s;
      instanaHeaders['x-instana-t'] = span.t;
    }
    const operation = this.convertOperationName(originalArgs[0].constructor.name);
    // invokeAsync doesn't have the option ClientContext
    if (operation === 'invoke') {
      if (params && params.ClientContext != null) {
        clientContextContentBase64 = Buffer.from(params.ClientContext, 'base64').toString();

        try {
          clientContextContentJSON = JSON.parse(clientContextContentBase64);
          if (typeof clientContextContentJSON.Custom === 'object') {
            Object.assign(clientContextContentJSON.Custom, instanaHeaders);
          } else {
            clientContextContentJSON.Custom = instanaHeaders;
          }
        } catch (err) {
          // ClientContext has a value that is not JSON, then we cannot add Instana headers
          isJSON = false;
        }
      } else {
        clientContextContentJSON = {
          Custom: instanaHeaders
        };
      }

      if (isJSON) {
        clientContextContentBase64 = Buffer.from(JSON.stringify(clientContextContentJSON), 'utf8').toString('base64');

        if (clientContextContentBase64.length <= MAX_CONTEXT_SIZE) {
          params.ClientContext = clientContextContentBase64;
        }
      }
    }
  }

  instrumentedSmithySend(ctx, isActive, originalSend, smithySendArgs) {
    const self = this;
    const skipTracingResult = cls.skipExitTracing({ isActive, extendedResponse: true });
    if (skipTracingResult.skip) {
      if (skipTracingResult.suppressed) {
        this.propagateInstanaHeaders(smithySendArgs, null, skipTracingResult.suppressed);
      }

      return originalSend.apply(ctx, smithySendArgs);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(SPAN_NAME, EXIT);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedMakeRequest, 1);
      span.data[this.spanName] = this.buildSpanData(smithySendArgs[0], smithySendArgs[0].input);

      this.propagateInstanaHeaders(smithySendArgs, span);
      const callback = typeof smithySendArgs[1] === 'function' ? smithySendArgs[1] : smithySendArgs[2];
      if (callback) {
        const callbackIndex = callback === smithySendArgs[1] ? 1 : 2;
        smithySendArgs[callbackIndex] = cls.ns.bind(function (err, data) {
          if (data && data.code) {
            self.finishSpan(data, span);
          } else {
            self.finishSpan(err, span);
          }
          callback.apply(this, arguments);
        });
        return originalSend.apply(ctx, smithySendArgs);
      } else {
        const request = originalSend.apply(ctx, smithySendArgs);
        request
          .then(() => {
            this.finishSpan(null, span);
          })
          .catch(err => {
            this.finishSpan(err, span);
          });

        return request;
      }
    });
  }

  buildSpanData(_operation, params) {
    const spanData = {
      function: (params && params.FunctionName) || ''
    };

    if (params && params.InvocationType) {
      spanData.type = params.InvocationType;
    }
    return spanData;
  }
}

module.exports = new InstanaAWSLambda(SPAN_NAME);
