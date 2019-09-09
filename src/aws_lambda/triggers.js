'use strict';

module.exports = exports = function extractTrigger(event) {
  if (event.awslogs != null) {
    return 'aws:cloudwatch.logs';
  } else if (Array.isArray(event.Records) && event.Records[0].eventSource === 'aws:s3') {
    return 'aws:s3';
  } else if (event.source === 'aws.events') {
    return 'aws:cloudwatch.events';
  }
  return 'unknown';
};
