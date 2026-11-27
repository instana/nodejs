/*
 * (c) Copyright IBM Corp. 2026
 */

/* eslint-disable no-await-in-loop */

'use strict';

const AWS = require('aws-sdk');

// Fail fast instead of waiting for the SDK defaults (120s timeout, multiple retries) on unreachable regions.
const CLIENT_OPTIONS = { maxRetries: 1, httpOptions: { connectTimeout: 5000, timeout: 20000 } };

/**
 * Reads the AWS credentials from the AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN environment
 * variables (e.g. exported by `awstoken <MFA-CODE>`).
 */
exports.getCredentials = function getCredentials() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN } = process.env;

  return new AWS.Credentials({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    sessionToken: AWS_SESSION_TOKEN
  });
};

/**
 * Applies the shared `--prefix` and `--created-by-me` filters to the resources of one region.
 *
 * Most AWS services do not record who created a resource, so the creator is read from the CloudTrail events of the
 * last 90 days (the CloudTrail event history limit): a resource counts as created by the caller if a successful
 * `creation.eventName` event issued by `callerArn` mentions its name.
 *
 * @param {Array<{ id: string }>} resources resources of one region, `id` being the resource name
 * @param {object} credentials
 * @param {string} region
 * @param {{ prefix?: string, createdByMe?: boolean, callerArn: string }} options
 * @param {{ eventName: string, getName: (requestParameters: object) => string|undefined }} creation
 */
async function filterResources(resources, credentials, region, options, creation) {
  let filtered = resources;
  if (options.prefix) {
    filtered = filtered.filter(r => r.id.startsWith(options.prefix));
  }
  // Only ask CloudTrail (heavily rate limited) in regions that actually have matching resources.
  if (options.createdByMe && filtered.length > 0) {
    const ownNames = await getNamesCreatedBy(credentials, region, options.callerArn, creation);
    filtered = filtered.filter(r => ownNames.has(r.id));
  }
  return filtered;
}

async function getNamesCreatedBy(credentials, region, callerArn, { eventName, getName }) {
  const cloudTrail = new AWS.CloudTrail({ credentials, region, ...CLIENT_OPTIONS, maxRetries: 5 });
  const names = new Set();
  let nextToken;
  do {
    const page = await cloudTrail
      .lookupEvents({
        LookupAttributes: [{ AttributeKey: 'EventName', AttributeValue: eventName }],
        NextToken: nextToken
      })
      .promise();
    page.Events.forEach(event => {
      const detail = JSON.parse(event.CloudTrailEvent);
      const name = detail.requestParameters && getName(detail.requestParameters);
      if (detail.errorCode || !name || !detail.userIdentity || detail.userIdentity.arn !== callerArn) {
        return;
      }
      names.add(name);
    });
    nextToken = page.NextToken;
  } while (nextToken);
  return names;
}

const bucketsByCredentials = new WeakMap();

function getBucketsWithRegion(credentials) {
  if (!bucketsByCredentials.has(credentials)) {
    bucketsByCredentials.set(credentials, loadBucketsWithRegion(credentials));
  }
  return bucketsByCredentials.get(credentials);
}

async function loadBucketsWithRegion(credentials) {
  const s3 = new AWS.S3({ credentials, region: 'us-east-1', ...CLIENT_OPTIONS });
  const { Buckets } = await s3.listBuckets().promise();
  return Promise.all(
    Buckets.map(async bucket => {
      try {
        const { LocationConstraint } = await s3.getBucketLocation({ Bucket: bucket.Name }).promise();
        return { name: bucket.Name, region: normalizeRegion(LocationConstraint) };
      } catch (err) {
        // Without the location the bucket cannot be assigned to a region, so it is not touched.
        return { name: bucket.Name, region: null };
      }
    })
  );
}

function normalizeRegion(locationConstraint) {
  if (!locationConstraint) return 'us-east-1'; // empty means us-east-1
  if (locationConstraint === 'EU') return 'eu-west-1'; // legacy value
  return locationConstraint;
}

exports.services = {
  lambda: {
    label: 'Lambda function',

    async list(credentials, region, options) {
      const lambda = new AWS.Lambda({ credentials, region, ...CLIENT_OPTIONS });
      const functions = [];

      let marker;
      do {
        const page = await lambda.listFunctions({ Marker: marker }).promise();
        functions.push(...page.Functions);
        marker = page.NextMarker;
      } while (marker);

      const resources = functions.map(fn => ({ id: fn.FunctionName, details: fn.Runtime || fn.PackageType }));
      return filterResources(resources, credentials, region, options, {
        eventName: 'CreateFunction20150331',
        // functionName may be a plain name or a (partial) ARN.
        getName: params => params.functionName && params.functionName.split(':function:').pop().split(':')[0]
      });
    },

    async remove(credentials, region, resource) {
      const lambda = new AWS.Lambda({ credentials, region });
      await lambda.deleteFunction({ FunctionName: resource.id }).promise();
    }
  },

  s3: {
    label: 'S3 bucket',

    async list(credentials, region, options) {
      const buckets = await getBucketsWithRegion(credentials);
      const resources = buckets
        .filter(bucket => bucket.region === region)
        .map(bucket => ({ id: bucket.name, details: 'bucket, all objects are deleted with it' }));

      return filterResources(resources, credentials, region, options, {
        eventName: 'CreateBucket',
        getName: params => params.bucketName
      });
    },

    // A bucket can only be deleted when it is empty, so all object versions and delete markers are removed first.
    async remove(credentials, region, resource) {
      const s3 = new AWS.S3({ credentials, region });
      let page;
      do {
        page = await s3.listObjectVersions({ Bucket: resource.id }).promise();
        const objects = [...(page.Versions || []), ...(page.DeleteMarkers || [])].map(o => ({
          Key: o.Key,
          VersionId: o.VersionId
        }));
        if (objects.length > 0) {
          const result = await s3
            .deleteObjects({ Bucket: resource.id, Delete: { Objects: objects, Quiet: true } })
            .promise();
          if (result.Errors && result.Errors.length > 0) {
            throw new Error(`could not delete ${result.Errors.length} object(s): ${result.Errors[0].Message}`);
          }
        }
      } while (page.IsTruncated);

      await s3.deleteBucket({ Bucket: resource.id }).promise();
    }
  },

  dynamodb: {
    label: 'DynamoDB table',

    async list(credentials, region, options) {
      const dynamodb = new AWS.DynamoDB({ credentials, region, ...CLIENT_OPTIONS });
      const names = [];

      let lastName;
      do {
        const page = await dynamodb.listTables({ ExclusiveStartTableName: lastName }).promise();
        names.push(...page.TableNames);
        lastName = page.LastEvaluatedTableName;
      } while (lastName);

      const resources = names.map(name => ({ id: name, details: 'table' }));
      return filterResources(resources, credentials, region, options, {
        eventName: 'CreateTable',
        getName: params => params.tableName
      });
    },

    async remove(credentials, region, resource) {
      const dynamodb = new AWS.DynamoDB({ credentials, region });
      await dynamodb.deleteTable({ TableName: resource.id }).promise();
    }
  },

  kinesis: {
    label: 'Kinesis stream',

    async list(credentials, region, options) {
      const kinesis = new AWS.Kinesis({ credentials, region, ...CLIENT_OPTIONS });
      const names = [];

      let page;
      do {
        page = await kinesis.listStreams({ ExclusiveStartStreamName: names[names.length - 1] }).promise();
        names.push(...page.StreamNames);
      } while (page.HasMoreStreams && page.StreamNames.length > 0);

      const resources = names.map(name => ({ id: name, details: 'stream' }));
      return filterResources(resources, credentials, region, options, {
        eventName: 'CreateStream',
        getName: params => params.streamName
      });
    },

    async remove(credentials, region, resource) {
      const kinesis = new AWS.Kinesis({ credentials, region });
      await kinesis.deleteStream({ StreamName: resource.id, EnforceConsumerDeletion: true }).promise();
    }
  },

  sns: {
    label: 'SNS topic',

    async list(credentials, region, options) {
      const sns = new AWS.SNS({ credentials, region, ...CLIENT_OPTIONS });
      const arns = [];

      let nextToken;
      do {
        const page = await sns.listTopics({ NextToken: nextToken }).promise();
        arns.push(...page.Topics.map(topic => topic.TopicArn));
        nextToken = page.NextToken;
      } while (nextToken);

      // The topic name is the last part of the ARN.
      const resources = arns.map(arn => ({ id: arn.split(':').pop(), details: 'topic', arn }));
      return filterResources(resources, credentials, region, options, {
        eventName: 'CreateTopic',
        getName: params => params.name
      });
    },

    async remove(credentials, region, resource) {
      const sns = new AWS.SNS({ credentials, region });
      await sns.deleteTopic({ TopicArn: resource.arn }).promise();
    }
  },

  sqs: {
    label: 'SQS queue',

    async list(credentials, region, options) {
      const sqs = new AWS.SQS({ credentials, region, ...CLIENT_OPTIONS });
      const urls = [];

      let nextToken;
      do {
        const page = await sqs.listQueues({ MaxResults: 1000, NextToken: nextToken }).promise();
        urls.push(...(page.QueueUrls || []));
        nextToken = page.NextToken;
      } while (nextToken);

      // The queue name is the last part of the queue URL.
      const resources = urls.map(url => ({ id: url.split('/').pop(), details: 'queue', url }));
      return filterResources(resources, credentials, region, options, {
        eventName: 'CreateQueue',
        getName: params => params.queueName
      });
    },

    async remove(credentials, region, resource) {
      const sqs = new AWS.SQS({ credentials, region });
      await sqs.deleteQueue({ QueueUrl: resource.url }).promise();
    }
  }
};
