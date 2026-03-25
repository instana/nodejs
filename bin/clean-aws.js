#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/*  eslint-disable import/no-extraneous-dependencies, instana/no-unsafe-require */

'use strict';

const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const { SQSClient, ListQueuesCommand, GetQueueAttributesCommand, DeleteQueueCommand } = require('@aws-sdk/client-sqs');
const {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  DeleteTableCommand
} = require('@aws-sdk/client-dynamodb');
const {
  S3Client,
  ListBucketsCommand,
  ListObjectsCommand,
  DeleteObjectsCommand,
  DeleteBucketCommand
} = require('@aws-sdk/client-s3');
const { SNSClient, ListTopicsCommand, GetTopicAttributesCommand, DeleteTopicCommand } = require('@aws-sdk/client-sns');
const {
  KinesisClient,
  ListStreamsCommand,
  DescribeStreamCommand,
  DeleteStreamCommand
} = require('@aws-sdk/client-kinesis');

const region = 'us-east-2';
const sqs = new SQSClient({ region });
const dynamoDb = new DynamoDBClient({ region });
const s3 = new S3Client({ region });
const sns = new SNSClient({ region });
const kinesis = new KinesisClient({ region });

const dynamoDbInfo = {
  name: 'dynamodb',
  api: dynamoDb,
  listCommand: ListTablesCommand,
  listProperty: 'TableNames',
  criteria: 'nodejs-team',
  limit: 50,
  attributesCommand: DescribeTableCommand,
  getAttributesParams(item) {
    return { TableName: item };
  },
  getReturnedAttributes(item, data) {
    return {
      tbl: item,
      ts: +new Date(data.Table.CreationDateTime)
    };
  },
  itemName: 'tbl',
  deleteCommand: DeleteTableCommand,
  preConditionPromise: () => Promise.resolve(),
  getDeleteAttributes(itemName) {
    return {
      TableName: itemName
    };
  }
};

const s3Info = {
  name: 's3',
  api: s3,
  listCommand: ListBucketsCommand,
  listProperty: 'Buckets',
  itemAttribute: 'Name',
  itemDateAttribute: 'CreationDate',
  criteria: 'nodejs-team',
  useIncludes: true, // Use includes() to match buckets with nodejs-team anywhere in the name
  getReturnedAttributes(item) {
    return {
      bucket: item.Name,
      ts: +new Date(item.CreationDate)
    };
  },
  itemName: 'bucket',
  deleteCommand: DeleteBucketCommand,
  preConditionPromise: async itemName => {
    const data = await s3.send(
      new ListObjectsCommand({
        Bucket: itemName,
        MaxKeys: 999
      })
    );

    if (!data.Contents || data.Contents.length === 0) {
      return Promise.resolve();
    }

    const keysToDelete = data.Contents.map(obj => ({ Key: obj.Key }));

    return s3.send(
      new DeleteObjectsCommand({
        Bucket: itemName,
        Delete: {
          Objects: keysToDelete
        }
      })
    );
  },
  getDeleteAttributes(itemName) {
    return {
      Bucket: itemName
    };
  }
};

const kinesisInfo = {
  name: 'kinesis',
  api: kinesis,
  listCommand: ListStreamsCommand,
  listProperty: 'StreamNames',
  criteria: 'nodejs-team',
  attributesCommand: DescribeStreamCommand,
  getAttributesParams(item) {
    return { StreamName: item };
  },
  getReturnedAttributes(item, data) {
    return {
      stream: item,
      ts: +new Date(data.StreamDescription.StreamCreationTimestamp)
    };
  },
  itemName: 'stream',
  deleteCommand: DeleteStreamCommand,
  preConditionPromise: () => Promise.resolve(),
  getDeleteAttributes(itemName) {
    return {
      StreamName: itemName
    };
  }
};

const sqsInfo = {
  name: 'sqs',
  api: sqs,
  listCommand: ListQueuesCommand,
  listProperty: 'QueueUrls',
  // SQS URLs have format: https://sqs.region.amazonaws.com/account-id/queue-name
  criteria: 'nodejs-team',
  useIncludes: true,
  attributesCommand: GetQueueAttributesCommand,
  getAttributesParams(item) {
    return { QueueUrl: item, AttributeNames: ['LastModifiedTimestamp'] };
  },
  getReturnedAttributes(item, data) {
    const time = parseInt(data.Attributes.LastModifiedTimestamp, 10) * 1000;
    return {
      queue: item,
      ts: time
    };
  },
  itemName: 'queue',
  deleteCommand: DeleteQueueCommand,
  preConditionPromise: () => Promise.resolve(),
  getDeleteAttributes(itemName) {
    return {
      QueueUrl: itemName
    };
  }
};

const snsInfo = {
  name: 'sns',
  api: sns,
  listCommand: ListTopicsCommand,
  listProperty: 'Topics',
  itemAttribute: 'TopicArn',
  // For SNS, we need to match the topic name part of the ARN
  criteria: 'nodejs-team',
  useIncludes: true,
  attributesCommand: GetTopicAttributesCommand,
  getAttributesParams(item) {
    return { TopicArn: item.TopicArn };
  },
  itemName: 'TopicArn',
  getReturnedAttributes(item) {
    // SNS topics do not have a creation date or launch date
    return {
      TopicArn: item.TopicArn,
      ts: Date.now()
    };
  },
  deleteCommand: DeleteTopicCommand,
  preConditionPromise: () => Promise.resolve(),
  getDeleteAttributes(itemName) {
    return {
      TopicArn: itemName
    };
  }
};

async function getTeamNodeAWSItems(apiInfo, skipDateCheck, criteria) {
  const rawItems = await apiInfo.api.send(new apiInfo.listCommand({}));

  console.log(`Found ${rawItems[apiInfo.listProperty]?.length || 0} total items`);

  if (!rawItems[apiInfo.listProperty] || rawItems[apiInfo.listProperty].length === 0) {
    return Promise.resolve([]);
  }

  const filteredItems = rawItems[apiInfo.listProperty].filter(item => {
    const _item = item[apiInfo.itemAttribute] || item;
    const searchCriteria = criteria || apiInfo.criteria;

    if (apiInfo.useIncludes) {
      return _item.includes(searchCriteria);
    }
    return _item.indexOf(searchCriteria) === 0;
  });

  console.log(`Found ${filteredItems.length} items to delete.`);

  const date = new Date();
  date.setHours(date.getHours() - 3);

  if (apiInfo.itemDateAttribute) {
    const _items = filteredItems.map(item => {
      return apiInfo.getReturnedAttributes(item);
    });

    let itemsToDelete = _items;
    // only remove items which are older than 3h
    if (!skipDateCheck) {
      itemsToDelete = _items.filter(item => item.ts < date.getTime());
      console.log(`${itemsToDelete.length} items are older than 3 hours`);
    }

    itemsToDelete = itemsToDelete.map(item => {
      return { name: item[apiInfo.itemName], ts: new Date(item.ts) };
    });

    return Promise.resolve(itemsToDelete);
  } else {
    // no creation date, so we search each filtered item to get the creation date
    const promises = filteredItems.map(async item => {
      const data = await apiInfo.api.send(new apiInfo.attributesCommand(apiInfo.getAttributesParams(item)));
      return apiInfo.getReturnedAttributes(item, data);
    });

    // filter results which creation date is older than 3h
    return Promise.all(promises).then(items2 => {
      if (!skipDateCheck) {
        const beforeFilter = items2.length;
        items2 = items2.filter(item => item.ts < date.getTime());
        console.log(`${items2.length} of ${beforeFilter} items are older than 3 hours`);
      }

      return items2.map(item => {
        return {
          name: item[apiInfo.itemName],
          ts: new Date(item.ts)
        };
      });
    });
  }
}

async function cleanupOldItems(apiInfo, dryRun, skipDateCheck, criteria) {
  try {
    const items = await getTeamNodeAWSItems(apiInfo, skipDateCheck, criteria);

    if (items.length === 0) {
      console.log(`${dryRun ? '[DRY RUN] ' : ''}No items to delete`);
      return;
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would have deleted ${items.length} items:`, items);
      return;
    }

    if (apiInfo.limit && items.length > apiInfo.limit) {
      console.log(
        `There are ${items.length} items eligible for deletion but the AWS service ` +
          `is limited to delete ${apiInfo.limit} at once. ` +
          `Deleting ${apiInfo.limit} items now. Run the script again to delete more.`
      );
      items.splice(apiInfo.limit);
    }

    const promises = items.map(async item => {
      await apiInfo.preConditionPromise(item.name);
      await apiInfo.api.send(new apiInfo.deleteCommand(apiInfo.getDeleteAttributes(item.name)));
    });

    await Promise.all(promises);
    console.log(`Successfully deleted ${items.length} items:`, items);
  } catch (err) {
    console.log('Something went wrong:', err);
    throw err;
  }
}

const argsOptions = {
  s3: s3Info,
  dynamodb: dynamoDbInfo,
  sqs: sqsInfo,
  kinesis: kinesisInfo,
  sns: snsInfo
};

/**
 * Usage
 *
 * bin/clean-aws.js --help
 * bin/clean-aws.js --dry=true
 * bin/clean-aws.js --service=sns
 * bin/clean-aws.js --service=sqs --skipDateCheck
 */
const argv = yargs(hideBin(process.argv))
  .option('service', {
    alias: 's',
    type: 'string',
    default: 'all',
    description: 's3, sqs, dynamodb, kinesis, sns, all (default: all)'
  })
  .option('dry', {
    alias: 'd',
    default: false,
    type: 'boolean',
    description:
      'Use --dry=true to only print the items that would be deleted instead of actually deleting them, off by default.'
  })
  .option('skipDateCheck', {
    alias: 'sd',
    default: false,
    type: 'boolean',
    description: 'The script will only delete data older than 3 hours. You can skip this condition.'
  })
  .option('criteria', {
    alias: 'c',
    type: 'string',
    description: 'Matching string for the item name.'
  })
  .parse();

async function runCleanup() {
  if (argv.service === 'all') {
    console.log('Running cleanup for all services...\n');
    const services = Object.keys(argsOptions);

    const results = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const serviceName of services) {
      console.log(`\n=== Cleaning up ${serviceName.toUpperCase()} ===`);
      // eslint-disable-next-line no-await-in-loop
      results.push(await cleanupOldItems(argsOptions[serviceName], argv.dry, argv.skipDateCheck, argv.criteria));
    }
    console.log('\n=== Cleanup complete for all services ===');
    return results;
  }
  return cleanupOldItems(argsOptions[argv.service], argv.dry, argv.skipDateCheck, argv.criteria);
}

runCleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
