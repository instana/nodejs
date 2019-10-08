'use strict';

const tracingConstants = require('@instana/core').tracing.constants;
const zlib = require('zlib');

const maxCloudwatchEventsResources = 3;
const maxCloudwatchEventsLength = 200;
const maxCloudwatchLogsEvents = 3;
const maxCloudwatchLogsEventLength = 200;
const maxS3Records = 3;
const maxS3ObjectKeyLength = 200;
const maxSQSRecords = 3;

exports.enrichSpanWithTriggerData = function enrichSpanWithTriggerData(event, span) {
  if (isApiGatewayProxyTrigger(event)) {
    span.data.lambda.trigger = 'aws:api.gateway';
    extractHttpFromApiGatewwayProxyEvent(event, span);
    return;
  } else if (isApplicationLoadBalancerTrigger(event)) {
    span.data.lambda.trigger = 'aws:application.load.balancer';
    extractHttpFromApplicationLoadBalancerEvent(event, span);
    return;
  } else if (isCloudwatchEventTrigger(event)) {
    span.data.lambda.trigger = 'aws:cloudwatch.events';
    extractEventFromCloudwatchEvent(event, span);
    return;
  } else if (isCloudwatchLogsTrigger(event)) {
    span.data.lambda.trigger = 'aws:cloudwatch.logs';
    extractEventFromCloudwatchLogs(event, span);
    return;
  } else if (isS3Trigger(event)) {
    span.data.lambda.trigger = 'aws:s3';
    extractEventFromS3(event, span);
    return;
  } else if (isSQSTrigger(event)) {
    span.data.lambda.trigger = 'aws:sqs';
    extractEventFromSQS(event, span);
    return;
  }

  // When an API Gateway is used without the "Use Lambda Proxy" setting, the body from the HTTP request is forwarded
  // as-is as the event. If there is no HTTP body, an empty object is passed. There is no way of differentiating such an
  // invocation reliably by inspecting the event object. Thus, we assume all invocations that we cannot identify as
  // something else are in fact API gateway calls without the lambda proxy setting.
  span.data.lambda.trigger = 'aws:api.gateway.noproxy';
};

function isApiGatewayProxyTrigger(event) {
  return event.resource != null && event.path != null && event.httpMethod != null;
}

function extractHttpFromApiGatewwayProxyEvent(event, span) {
  // Remark: We never extract host headers for Lambda entries even if we could some times, because they are of no
  // interest.
  span.data.http = {
    method: event.httpMethod,
    url: event.path,
    path_tpl: event.resource,
    params: readHttpQueryParams(event)
  };
}

function readHttpQueryParams(event) {
  if (event.multiValueQueryStringParameters) {
    return Object.keys(event.multiValueQueryStringParameters)
      .map(key =>
        event.multiValueQueryStringParameters[key].reduce((paramsPerKey, value) => {
          paramsPerKey.push(`${key}=${value}`);
          return paramsPerKey;
        }, [])
      )
      .reduce((flattendParamsArray, paramsForOneKey) => flattendParamsArray.concat(paramsForOneKey), [])
      .join('&');
  } else if (event.queryStringParameters) {
    return Object.keys(event.queryStringParameters)
      .map(key => `${key}=${event.queryStringParameters[key]}`)
      .join('&');
  }
  return undefined;
}

function isApplicationLoadBalancerTrigger(event) {
  return event.requestContext && event.requestContext.elb;
}

function extractHttpFromApplicationLoadBalancerEvent(event, span) {
  // Remark: We never extract host headers for Lambda entries even if we could some times, because they are of no
  // interest.
  span.data.http = {
    method: event.httpMethod,
    url: event.path,
    params: readHttpQueryParams(event)
  };
}

function isCloudwatchEventTrigger(event) {
  return event.source === 'aws.events' && event['detail-type'] === 'Scheduled Event';
}

function extractEventFromCloudwatchEvent(event, span) {
  span.data.lambda.cw = {
    events: {}
  };
  span.data.lambda.cw.events.id = event.id;
  if (Array.isArray(event.resources) && event.resources.length > 0) {
    // we arbitrarily fetch at most the first three resources
    span.data.lambda.cw.events.resources = event.resources
      .slice(0, maxCloudwatchEventsResources)
      .map(cwEvent =>
        cwEvent.length > maxCloudwatchEventsLength ? `${cwEvent.substring(0, maxCloudwatchEventsLength)}…` : cwEvent
      );
    span.data.lambda.cw.events.more = event.resources.length > maxCloudwatchEventsResources;
  }
}

function isCloudwatchLogsTrigger(event) {
  return event.awslogs != null;
}

function extractEventFromCloudwatchLogs(event, span) {
  span.data.lambda.cw = {
    logs: {}
  };
  const payload = Buffer.from(event.awslogs.data, 'base64');
  zlib.gunzip(payload, (err, decodedEvent) => {
    if (err && err.message) {
      span.data.lambda.cw.logs.decodingError = `Could not decode the Cloudwatch logs payload: ${err.message}`;
    } else if (err) {
      span.data.lambda.cw.logs.decodingError = 'Could not decode the Cloudwatch logs payload.';
    } else {
      try {
        decodedEvent = JSON.parse(decodedEvent.toString('ascii'));
      } catch (err2) {
        span.data.lambda.cw.logs.decodingError = `Could not parse the Cloudwatch logs payload: ${err2.message}`;
      }
      span.data.lambda.cw.logs.group = decodedEvent.logGroup;
      span.data.lambda.cw.logs.stream = decodedEvent.logStream;
      // we arbitrarily fetch at most the first three log events
      if (Array.isArray(decodedEvent.logEvents) && decodedEvent.logEvents.length > 0) {
        span.data.lambda.cw.logs.events = decodedEvent.logEvents
          .slice(0, maxCloudwatchLogsEvents)
          .map(evnt => evnt.message)
          .map(msg =>
            msg.length > maxCloudwatchLogsEventLength ? `${msg.substring(0, maxCloudwatchLogsEventLength)}…` : msg
          );
        span.data.lambda.cw.logs.more = decodedEvent.logEvents.length > maxCloudwatchLogsEvents;
      }
    }
  });
}

function isS3Trigger(event) {
  return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].eventSource === 'aws:s3';
}

function extractEventFromS3(event, span) {
  span.data.lambda.s3 = {
    events: event.Records.slice(0, maxS3Records).map(s3Record => ({
      event: s3Record.eventName,
      bucket: s3Record.s3 && s3Record.s3.bucket ? s3Record.s3.bucket.name : undefined,
      object: s3RecordToObject(s3Record)
    }))
  };
  span.data.lambda.s3.more = event.Records.length > maxS3Records;
}

function s3RecordToObject(s3Record) {
  if (s3Record.s3 && s3Record.s3.object && s3Record.s3.object.key) {
    return s3Record.s3.object.key.length > maxS3ObjectKeyLength
      ? `${s3Record.s3.object.key.substring(0, maxS3ObjectKeyLength)}…`
      : s3Record.s3.object.key;
  } else {
    return undefined;
  }
}

function isSQSTrigger(event) {
  return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].eventSource === 'aws:sqs';
}

function extractEventFromSQS(event, span) {
  span.data.lambda.sqs = {
    messages: event.Records.slice(0, maxSQSRecords).map(sqsRecord => ({
      queue: sqsRecord.eventSourceARN
    }))
  };
  span.data.lambda.sqs.more = event.Records.length > maxSQSRecords;
}

exports.readTracingHeaders = function readTracingHeaders(event) {
  const tracingHeaders = {};
  if (event.headers && typeof event.headers === 'object') {
    let lowerCaseKey;
    Object.keys(event.headers).forEach(key => {
      if (typeof key === 'string') {
        lowerCaseKey = key.toLowerCase();
        if (lowerCaseKey === tracingConstants.traceIdHeaderNameLowerCase) {
          tracingHeaders.t = event.headers[key];
        } else if (lowerCaseKey === tracingConstants.spanIdHeaderNameLowerCase) {
          tracingHeaders.s = event.headers[key];
        } else if (lowerCaseKey === tracingConstants.traceLevelHeaderNameLowerCase) {
          tracingHeaders.l = event.headers[key];
        }
      }
    });
  }
  return tracingHeaders;
};
