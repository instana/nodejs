#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/*  eslint-disable import/no-extraneous-dependencies, instana/no-unsafe-require */

'use strict';

const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const aws = require('aws-sdk');
const region = { region: 'us-east-2' };
const sqs = new aws.SQS(region);
const dynamoDb = new aws.DynamoDB(region);
const s3 = new aws.S3(region);
const sns = new aws.SNS(region);
const kinesis = new aws.Kinesis(region);

const dynamoDbInfo = {
  api: dynamoDb,
  listFunction: 'listTables',
  listProperty: 'TableNames',
  criteria: 'nodejs-team',
  limit: 50,
  attributesFunction: 'describeTable',
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
  deleteFunction: 'deleteTable',
  preConditionPromise: () => Promise.resolve(),
  getDeleteAttributes(itemName) {
    return {
      TableName: itemName
    };
  }
};

const s3Info = {
  api: s3,
  listFunction: 'listBuckets',
  listProperty: 'Buckets',
  itemAttribute: 'Name', // if item is not a string but an object, we can do item[itemAttribute]
  itemDateAttribute: 'CreationDate', // if the item object already has a date value, so we use this instead
  criteria: 'nodejs-team',
  attributesFunction: 'describeTable',
  getAttributesParams(item) {
    return { TableName: item };
  },
  getReturnedAttributes(item) {
    return {
      bucket: item.Name,
      ts: +new Date(item.CreationDate)
    };
  },
  itemName: 'bucket',
  deleteFunction: 'deleteBucket',
  preConditionPromise: async itemName => {
    const data = await s3
      .listObjects({
        Bucket: itemName,
        MaxKeys: 999
      })
      .promise();

    const keysToDelete = data.Contents.map(obj => ({ Key: obj.Key }));

    /**
     * If there are no objects to delete, we cannot pass an empty array in the payload, or the AWS backend will throw
     * an error.
     */
    if (keysToDelete.length === 0) {
      return Promise.resolve();
    } else {
      return s3
        .deleteObjects({
          Bucket: itemName,
          Delete: {
            Objects: data.Contents.map(obj => ({ Key: obj.Key }))
          }
        })
        .promise();
    }
  },
  getDeleteAttributes(itemName) {
    return {
      Bucket: itemName
    };
  }
};

const kinesisInfo = {
  api: kinesis,
  listFunction: 'listStreams',
  listProperty: 'StreamNames',
  // itemAttribute: 'Name', // if item is not a string but an object, we can do item[itemAttribute]
  // itemDateAttribute: 'CreationDate', // if the item object already has a date value, so we use this instead
  criteria: 'nodejs-team',
  attributesFunction: 'describeStream',
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
  deleteFunction: 'deleteStream',
  preConditionPromise: () => Promise.resolve(),
  getDeleteAttributes(itemName) {
    return {
      StreamName: itemName
    };
  }
};

const sqsInfo = {
  api: sqs,
  listFunction: 'listQueues',
  listProperty: 'QueueUrls',
  criteria: 'https://sqs.us-east-2.amazonaws.com/767398002385/nodejs-team',
  attributesFunction: 'getQueueAttributes',
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
  deleteFunction: 'deleteQueue',
  preConditionPromise: () => Promise.resolve(),
  getDeleteAttributes(itemName) {
    console.log('>>>>', itemName);
    return {
      QueueUrl: itemName
    };
  }
};

const snsInfo = {
  api: sns,
  listFunction: 'listTopics',
  listProperty: 'Topics',
  itemAttribute: 'TopicArn',
  criteria: 'arn:aws:sns:us-east-2:767398002385:nodejs-team',
  attributesFunction: 'getTopicAttributes',
  getAttributesParams(item) {
    return item;
  },
  itemName: 'TopicArn',
  getReturnedAttributes(item) {
    // SNS topics do not have a creation date or launch date
    return {
      TopicArn: item.TopicArn,
      ts: Date.now()
    };
  },
  deleteFunction: 'deleteTopic',
  preConditionPromise: () => Promise.resolve(),
  getDeleteAttributes(itemName) {
    return {
      TopicArn: itemName
    };
  }
};

async function getTeamNodeAWSItems(apiInfo, skipDateCheck, criteria) {
  // eg: s3.listBuckets()
  const rawItems = await apiInfo.api[apiInfo.listFunction]().promise();

  const filteredItems = rawItems[apiInfo.listProperty].filter(item => {
    const _item = item[apiInfo.itemAttribute] || item;
    return _item.indexOf(criteria || apiInfo.criteria) === 0;
  });

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
    }

    itemsToDelete = itemsToDelete.map(item => {
      return { name: item[apiInfo.itemName], ts: new Date(item.ts) };
    });

    return Promise.resolve(itemsToDelete);
  } else {
    // no creation date, so we search each filtered item to get the creation date
    const promises = filteredItems.map(item => {
      return apiInfo.api[apiInfo.attributesFunction](apiInfo.getAttributesParams(item))
        .promise()
        .then(data => {
          // eg: DynamoDB table { tbl: item, ts: +new Date(data.Table.CreationDateTime) }
          return apiInfo.getReturnedAttributes(item, data);
        });
    });

    // filter results which creation date is older than 3h
    return Promise.all(promises).then(items2 => {
      if (!skipDateCheck) {
        items2 = items2.filter(item => item.ts < date.getTime());
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

function cleanupOldItems(apiInfo, dryRun, skipDateCheck, criteria) {
  return getTeamNodeAWSItems(apiInfo, skipDateCheck, criteria)
    .then(items => {
      if (items.length > 0) {
        if (!dryRun) {
          if (apiInfo.limit && items.length > apiInfo.limit) {
            console.log(
              `There are ${items.length} items eligible for deletion but the AWS` +
                `service in question is limited to delete ${apiInfo.limit} at once.` +
                `I am going to delete ${apiInfo.limit} right now. Run the script again to delete more.`
            );

            // arbitrarily delete all item after position apiInfo.limit
            items.splice(apiInfo.limit);
          }

          const promises = items.map(item => {
            return apiInfo.preConditionPromise(item.name).then(() => {
              return apiInfo.api[apiInfo.deleteFunction](apiInfo.getDeleteAttributes(item.name)).promise();
            });
          });

          Promise.all(promises)
            .then(() => {
              console.log(`${items.length} items have been deleted:`, items);
            })
            .catch(err => {
              console.log(`Found ${items.length} items to delete:`, items);
              console.log(`Error deleting ${items.length} items:`, err);
            });
        } else {
          console.log(`[DRY RUN] Would have deleted ${items.length} items:`, items);
        }
      } else {
        console.log(`${dryRun ? '[DRY RUN]' : ''} No items to delete`);
      }
    })
    .catch(err => {
      console.log('Something went wrong:', err);
    });
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
 */
const argv = yargs(hideBin(process.argv))
  .option('service', {
    alias: 's',
    type: 'string',
    default: 's3',
    description: 's3, sqs, dynamodb, kinesis, sns'
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
    description: 'The script will only delete data older than 1 day. You can skip this condition.'
  })
  .option('criteria', {
    alias: 'c',
    type: 'string',
    description: 'Matching string for the item name.'
  })
  .parse();

cleanupOldItems(argsOptions[argv.service], argv.dry, argv.skipDateCheck, argv.criteria);
