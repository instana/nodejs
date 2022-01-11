#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const aws = require('aws-sdk');
const region = { region: 'us-east-2' };
const sqs = new aws.SQS(region);
const dynamoDb = new aws.DynamoDB(region);
const s3 = new aws.S3(region);
const kinesis = new aws.Kinesis(region);

const dynamoDbInfo = {
  api: dynamoDb,
  listFunction: 'listTables',
  listProperty: 'TableNames',
  criteria: 'nodejs-table-',
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
  criteria: 'nodejs-bucket-',
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
  criteria: 'nodejs-team-',
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
  criteria: 'https://sqs.us-east-2.amazonaws.com/410797082306/team-node',
  // criteria: 'https://sqs.us-east-2.amazonaws.com/410797082306/team-node-ci-test-queue',
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

async function getTeamNodeAWSItems(apiInfo) {
  // eg: s3.listBuckets()
  const rawItems = await apiInfo.api[apiInfo.listFunction]().promise();

  const filteredItems = rawItems[apiInfo.listProperty].filter(item => {
    const _item = item[apiInfo.itemAttribute] || item;
    return _item.indexOf(apiInfo.criteria) === 0;
  });

  if (apiInfo.itemDateAttribute) {
    const _items = filteredItems.map(item => {
      return apiInfo.getReturnedAttributes(item);
    });

    const yesterday = Date.now() - 24 * 3600 * 1000;
    const itemsToDelete = _items.filter(item => item.ts < yesterday).map(item => item[apiInfo.itemName]);
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

    // filter results which creation date is older than today
    return Promise.all(promises).then(items2 => {
      const yesterday = Date.now() - 24 * 3600 * 1000;
      return items2.filter(item => item.ts < yesterday).map(item => item[apiInfo.itemName]);
    });
  }
}

function cleanupOldItems(apiInfo, applyChanges = false) {
  return getTeamNodeAWSItems(apiInfo)
    .then(items => {
      if (items.length > 0) {
        if (applyChanges) {
          const promises = items.map(itemName => {
            return apiInfo.preConditionPromise(itemName).then(() => {
              return apiInfo.api[apiInfo.deleteFunction](apiInfo.getDeleteAttributes(itemName)).promise();
            });
          });
          Promise.all(promises)
            .then(data => {
              console.log('All items cleaned', data);
            })
            .catch(err => {
              console.log('Error deleting items', err);
            });
        } else {
          console.log('[DRY RUN] Would have deleted', items.length, items);
        }
      } else {
        console.log('No items to delete');
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
  kinesis: kinesisInfo
};

const optionsArray = Object.keys(argsOptions);
const args = process.argv.slice(2).map(arg => arg.toLocaleLowerCase());

if (!optionsArray.includes(args[0]) || args.length === 0) {
  console.log('****************************************************************************');
  console.log(`Valid commands are clean-aws.js [${optionsArray.join(' | ')}] [dry=false]`);
  console.log('eg: ./bin/clean-aws.js s3');
  console.log('Nothing will be deleted until you provide the `dry=false` option');
  console.log('****************************************************************************');
} else {
  cleanupOldItems(argsOptions[args[0]], args[1] === 'dry=false');
}
