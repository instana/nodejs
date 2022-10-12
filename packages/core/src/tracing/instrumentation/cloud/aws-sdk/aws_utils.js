/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { snsSqsInstanaHeaderPrefixRegex, sqsAttributeNames } = require('../../../constants');
const tracingUtil = require('../../../tracingUtil');

let tooManyAttributesWarningHasBeenLogged = false;

/**
 * Reads all trace context relevant message attributes from an incoming message and provides them in a normalized format
 * for later processing.
 */
function readTracingAttributes(sqsAttributes) {
  const tracingAttributes = {};
  if (!sqsAttributes) {
    return tracingAttributes;
  }

  tracingAttributes.traceId = readMessageAttribute(sqsAttributes, sqsAttributeNames.TRACE_ID);
  tracingAttributes.parentId = readMessageAttribute(sqsAttributes, sqsAttributeNames.SPAN_ID);
  tracingAttributes.level = readMessageAttribute(sqsAttributes, sqsAttributeNames.LEVEL);

  return tracingAttributes;
}

function readTracingAttributesFromSns(messageBody) {
  const tracingAttributes = {};
  // Parsing the message body introduces a tiny overhead which we want to avoid unless we are sure that the incoming
  // message actually has tracing attributes. Thus some preliminary, cheaper checks are executed first.
  if (
    typeof messageBody === 'string' &&
    messageBody.startsWith('{') &&
    messageBody.includes('"Type":"Notification"') &&
    snsSqsInstanaHeaderPrefixRegex.test(messageBody)
  ) {
    try {
      const parsedBody = JSON.parse(messageBody);
      if (parsedBody && parsedBody.MessageAttributes) {
        tracingAttributes.traceId = readMessageAttribute(parsedBody.MessageAttributes, sqsAttributeNames.TRACE_ID);
        tracingAttributes.parentId = readMessageAttribute(parsedBody.MessageAttributes, sqsAttributeNames.SPAN_ID);
        tracingAttributes.level = readMessageAttribute(parsedBody.MessageAttributes, sqsAttributeNames.LEVEL);
      }
    } catch (e) {
      // The attempt to parse the message body as JSON failed, so this is not an SQS message resulting from an SNS
      // notification (SNS-to-SQS subscription), in which case we are not interested in the body. Ignore the error and
      // move on.
    }
  }
  return tracingAttributes;
}

function readMessageAttribute(attributes, key) {
  const attribute = tracingUtil.readAttribCaseInsensitive(attributes, key);
  if (attribute) {
    // attribute.stringValue is used by SQS message attributes, attribute.Value is used by SNS-to-SQS.
    return attribute.StringValue || attribute.Value;
  }
}

/**
 * Checks whether the given tracingAttributes object has at least one attribute set, that is, if there have been Instana
 * message attributes present when converting message attributes into this object.
 */
function hasTracingAttributes(tracingAttributes) {
  return tracingAttributes.traceId != null || tracingAttributes.parentId != null || tracingAttributes.level != null;
}

/**
 * Add extra info to the entry span after messages are received
 * @param {*} span The SQS Span
 * @param {*} data The data returned by the SQS API
 * @param {*} tracingAttributes The message attributes relevant for tracing
 */
function configureEntrySpan(span, data, tracingAttributes) {
  span.data.sqs.size = data.Messages.length;
  span.ts = Date.now();

  if (tracingAttributes.traceId && tracingAttributes.parentId) {
    span.t = tracingAttributes.traceId;
    span.p = tracingAttributes.parentId;
  }
}

function logTooManyAttributesWarningOnce(logger, attributes, requiredNumberOfAttributes) {
  if (tooManyAttributesWarningHasBeenLogged) {
    return;
  }
  tooManyAttributesWarningHasBeenLogged = true;
  const existingAttributes = Object.keys(attributes);
  logger.warn(
    'Could not add trace correlation message attributes to an outgoing SQS or SNS message. Wanted to add ' +
      `${requiredNumberOfAttributes} attribute(s), but the messsage already has ${existingAttributes.length} ` +
      `attributes: ${existingAttributes.join(
        ', '
      )}. AWS imposes a limit of 10 message attributes. Trace correlation will be impacted -- the SQS receiver ` +
      'will start a new trace that is not connected to the trace for sending the message. This log message will ' +
      'only be logged once.'
  );
}

module.exports = {
  configureEntrySpan,
  hasTracingAttributes,
  readTracingAttributesFromSns,
  readTracingAttributes,
  logTooManyAttributesWarningOnce
};
