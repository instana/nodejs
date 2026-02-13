/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();

const async_ = require('async');
const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const morgan = require('morgan');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { v4: uuid } = require('uuid');
const logPrefix = `Google Cloud Storage Client (${process.pid}):\t`;

const options = { projectId: process.env.GCP_PROJECT, retryOptions: { maxRetries: 5 } };
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT) {
  options.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT);
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  options.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
} else {
  throw new Error('Credentials are missing.');
}

const storage = new Storage(options);

const port = require('@_local/collector/test/test_util/app-port')();
const bucketName = 'nodejs-tracer-test-bucket';
const fileName = 'test-file.txt';
const localFileName = path.join(__dirname, fileName);
const serviceAccountEmail = 'team-nodejs@k8s-brewery.iam.gserviceaccount.com';

const combineSource1 = randomObjectName('combine-source-1');
const combineSource2 = randomObjectName('combine-source-2');
const combineDestination = randomObjectName('combine-destination');

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => res.sendStatus(200));

app.post('/storage-createBucket-bucket-delete-promise', async (req, res) => {
  try {
    const [bucket] = await storage.createBucket(randomBucketName());
    await bucket.delete();
    res.sendStatus(200);
  } catch (e) {
    log(e);
    res.sendStatus(500);
  }
});

app.post('/storage-createBucket-bucket-delete-callback', (req, res) => {
  storage.createBucket(randomBucketName(), (errCreate, bucket) => {
    if (errCreate) {
      log(errCreate);
      return res.sendStatus(500);
    }
    bucket.delete(errDelete => {
      if (errDelete) {
        log(errDelete);
        return res.sendStatus(500);
      }
      res.sendStatus(200);
    });
  });
});

app.post('/bucket-create-bucket-delete-promise', async (req, res) => {
  try {
    const bucket = storage.bucket(randomBucketName());
    await bucket.create();
    await bucket.delete();
    res.sendStatus(200);
  } catch (e) {
    log(e);
    res.sendStatus(500);
  }
});

app.post('/bucket-create-bucket-delete-callback', (req, res) => {
  storage.createBucket(randomBucketName(), (errCreate, bucket) => {
    if (errCreate) {
      log(errCreate);
      return res.sendStatus(500);
    }
    bucket.delete(errDelete => {
      if (errDelete) {
        log(errDelete);
        return res.sendStatus(500);
      }
      res.sendStatus(200);
    });
  });
});

app.post('/storage-get-buckets-promise', async (req, res) => {
  try {
    await storage.getBuckets();
    res.sendStatus(200);
  } catch (e) {
    log(e);
    res.sendStatus(500);
  }
});

app.post('/storage-get-buckets-callback', (req, res) => {
  storage.getBuckets(err => {
    if (err) {
      log(err);
      return res.sendStatus(500);
    }
    res.sendStatus(200);
  });
});

app.post('/storage-get-service-account-promise', async (req, res) => {
  try {
    await storage.getServiceAccount();
    res.sendStatus(200);
  } catch (e) {
    log(e);
    res.sendStatus(500);
  }
});

app.post('/storage-get-service-account-callback', (req, res) => {
  storage.getServiceAccount(err => {
    if (err) {
      log(err);
      return res.sendStatus(500);
    }
    res.sendStatus(200);
  });
});

// This could simply be an entry in the bucketRoutes array, but the retention period can cause conflicts with
// concurrently running tests that try to delete an object from the bucket so we make sure this route creates its own
// unique bucket beforehand.
app.post('/bucket-set-and-remove-retention-period-promise', async (req, res) => {
  try {
    const bn = randomBucketName();
    const bucket = storage.bucket(bn);
    await bucket.create();
    await bucket.setRetentionPeriod([1]);
    await bucket.removeRetentionPeriod();
    await bucket.delete();
    res.sendStatus(200);
  } catch (e) {
    log(e);
    res.sendStatus(500);
  }
});

// This could simply be an entry in the bucketRoutes array, but the retention period can cause conflicts with
// concurrently running tests that try to delete an object from the bucket so we make sure this route creates its own
// unique bucket beforehand.
app.post('/bucket-set-and-remove-retention-period-callback', (req, res) => {
  storage.createBucket(randomBucketName(), (errCreate, bucket) => {
    if (errCreate) {
      log(errCreate);
      return res.sendStatus(500);
    }
    bucket.setRetentionPeriod([1], errSet => {
      if (errSet) {
        log(errSet);
        return res.sendStatus(500);
      }
      bucket.removeRetentionPeriod(errRemove => {
        if (errRemove) {
          log(errRemove);
          return res.sendStatus(500);
        }
        bucket.delete(errDelete => {
          if (errDelete) {
            log(errDelete);
            return res.sendStatus(500);
          }
          res.sendStatus(200);
        });
      });
    });
  });
});

const bucketRoutes = [
  {
    pathPrefix: 'add-lifecycle-rule',
    actions: [
      {
        method: 'addLifecycleRule',
        args: [
          {
            action: { type: 'Delete' },
            condition: {
              age: 1
            }
          },
          {
            append: false
          }
        ]
      }
    ]
  },
  {
    pathPrefix: 'combine',
    actions: [
      {
        method: 'upload',
        args: [localFileName, { destination: combineSource1, gzip: true }]
      },
      {
        method: 'upload',
        args: [localFileName, { destination: combineSource2, gzip: true }]
      },
      {
        method: 'combine',
        args: [[combineSource1, combineSource2], combineDestination]
      }
    ]
  },
  {
    pathPrefix: 'delete-files',
    actions: [
      {
        method: 'upload',
        args: [localFileName, { destination: randomObjectName('delete-me'), gzip: true }]
      },
      {
        method: 'deleteFiles',
        args: [{ prefix: 'delete-me' }]
      }
    ]
  },
  {
    pathPrefix: 'delete-labels',
    actions: [
      {
        method: 'deleteLabels',
        args: ['non-existent-label']
      }
    ]
  },
  {
    pathPrefix: 'exists',
    actions: [
      {
        method: 'exists'
      }
    ]
  },
  {
    pathPrefix: 'get',
    actions: [
      {
        method: 'get'
      }
    ]
  },
  {
    pathPrefix: 'get-files',
    actions: [
      {
        method: 'getFiles'
      }
    ]
  },
  {
    pathPrefix: 'get-labels',
    actions: [
      {
        method: 'getLabels'
      }
    ]
  },
  {
    pathPrefix: 'get-metadata',
    actions: [
      {
        method: 'getMetadata'
      }
    ]
  },
  {
    pathPrefix: 'get-notifications',
    actions: [
      {
        method: 'getNotifications'
      }
    ]
  },
  {
    pathPrefix: 'set-cors-configuration',
    actions: [
      {
        method: 'setCorsConfiguration',
        args: [[{ maxAgeSeconds: 3600 }]]
      }
    ]
  },
  {
    pathPrefix: 'set-labels',
    actions: [
      {
        method: 'setLabels',
        args: [{ testlabel: 'test-value' }]
      }
    ]
  },
  {
    pathPrefix: 'set-metadata',
    actions: [
      {
        method: 'setMetadata',
        args: [{}]
      }
    ]
  },
  {
    pathPrefix: 'set-storage-class',
    actions: [
      {
        method: 'setStorageClass',
        args: ['standard']
      }
    ]
  },
  {
    pathPrefix: 'upload',
    actions: [
      {
        method: 'upload',
        args: [localFileName, { gzip: true }]
      }
    ]
  }
];

bucketRoutes.forEach(({ pathPrefix, actions }) => {
  app.post(`/bucket-${pathPrefix}-promise`, async (req, res) => {
    try {
      const bucket = storage.bucket(bucketName);
      for (let i = 0; i < actions.length; i++) {
        const { method, args } = actions[i];
        // eslint-disable-next-line no-await-in-loop
        await bucket[method].apply(bucket, args);
      }
      res.sendStatus(200);
    } catch (e) {
      log(e);
      res.sendStatus(500);
    }
  });

  app.post(`/bucket-${pathPrefix}-callback`, (req, res) => {
    const bucket = storage.bucket(bucketName);
    async_.series(
      actions.map(action => {
        const { method, args = [] } = action;
        return bucket[method].bind(bucket, ...args);
      }),
      err => {
        if (err) {
          log(err);
          return res.sendStatus(500);
        }
        return res.sendStatus(200);
      }
    );
  });
});

app.post('/bucket-combine-error-promise', async (req, res) => {
  try {
    const bucket = storage.bucket(bucketName);
    await bucket.combine(['does-not-exist-1.txt', 'does-not-exist-2.txt'], 'combine-error.gz');
    log('Operation bucket.combine succeeded although it should not have succeeded.');
    res.sendStatus(500);
  } catch (e) {
    res.sendStatus(200);
  }
});

app.post('/bucket-combine-error-callback', (req, res) => {
  const bucket = storage.bucket(bucketName);
  bucket.combine(['does-not-exist-1.txt', 'does-not-exist-2.txt'], 'combine-error.gz', err => {
    if (err) {
      return res.sendStatus(200);
    }
    log('Operation bucket.combine succeeded although it should not have succeeded.');
    return res.sendStatus(500);
  });
});

const fileRoutes = [
  {
    pathPrefix: 'copy',
    uploadName: randomObjectName('source'),
    actions: [
      {
        method: 'copy',
        args: [randomObjectName('destination')]
      }
    ]
  },
  {
    pathPrefix: 'delete',
    uploadName: randomObjectName('file'),
    actions: [
      {
        method: 'delete'
      }
    ]
  },
  {
    pathPrefix: 'download',
    uploadName: randomObjectName('file'),
    actions: [
      {
        method: 'download'
      }
    ]
  },
  {
    pathPrefix: 'exists',
    uploadName: randomObjectName('file'),
    actions: [
      {
        method: 'exists'
      }
    ]
  },
  {
    pathPrefix: 'get',
    uploadName: randomObjectName('file'),
    actions: [
      {
        method: 'get'
      }
    ]
  },
  {
    pathPrefix: 'get-metadata',
    uploadName: randomObjectName('file'),
    actions: [
      {
        method: 'getMetadata'
      }
    ]
  },
  {
    pathPrefix: 'is-public',
    uploadName: randomObjectName('file'),
    actions: [
      {
        method: 'isPublic'
      }
    ]
  },
  {
    pathPrefix: 'move',
    uploadName: randomObjectName('file'),
    actions: [
      {
        method: 'move',
        args: [randomObjectName('destination')]
      }
    ]
  },
  {
    pathPrefix: 'save',
    uploadName: randomObjectName('file'),
    actions: [
      {
        method: 'save',
        args: ['some data']
      }
    ]
  },
  {
    pathPrefix: 'set-metadata',
    uploadName: randomObjectName('file'),
    actions: [
      {
        method: 'setMetadata',
        args: [{}]
      }
    ]
  },
  {
    pathPrefix: 'set-storage-class',
    uploadName: randomObjectName('file'),
    actions: [
      {
        method: 'setStorageClass',
        args: ['standard']
      }
    ]
  }
];

fileRoutes.forEach(({ pathPrefix, uploadName, actions }) => {
  app.post(`/file-${pathPrefix}-promise`, async (req, res) => {
    try {
      const bucket = storage.bucket(bucketName);
      // NOTE: when passing `resumable: false`, you need to pass the option to `file.save` too.
      //       there is currently no test for `resumeable: false`
      const [file] = await bucket.upload(localFileName, { destination: uploadName, gzip: true });

      for (let i = 0; i < actions.length; i++) {
        const { method, args } = actions[i];

        // eslint-disable-next-line no-await-in-loop
        await file[method].apply(file, args);
      }

      res.sendStatus(200);
    } catch (e) {
      log(e);
      res.sendStatus(500);
    }
  });

  app.post(`/file-${pathPrefix}-callback`, (req, res) => {
    const bucket = storage.bucket(bucketName);

    bucket.upload(localFileName, { destination: uploadName, gzip: true }, (errUpload, file) => {
      if (errUpload) {
        log(errUpload);
        return res.sendStatus(500);
      }

      async_.series(
        actions.map(action => {
          const { method, args = [] } = action;
          return file[method].bind(file, ...args);
        }),
        err => {
          if (err) {
            log(err);
            return res.sendStatus(500);
          }
          return res.sendStatus(200);
        }
      );
    });
  });
});

app.post('/file-read-stream', async (req, res) => {
  try {
    const bucket = storage.bucket(bucketName);
    const [remoteSource] = await bucket.upload(localFileName, { destination: randomObjectName('file'), gzip: true });
    const localTarget = path.join(__dirname, 'read-stream-target.txt');

    remoteSource
      .createReadStream()
      .on('error', err => {
        log(err);
        res.sendStatus(500);
      })
      .on('end', () => res.sendStatus(200))
      .pipe(fs.createWriteStream(localTarget));
  } catch (err) {
    log(err);
    res.sendStatus(500);
  }
});

app.post('/file-write-stream', async (req, res) => {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(randomObjectName('target'));
  fs.createReadStream(localFileName)
    .pipe(file.createWriteStream({ resumable: false }))
    .on('error', err => {
      log(err);
      res.sendStatus(500);
    })
    .on('finish', () => {
      res.sendStatus(200);
    });
});

app.post('/hmac-keys-promise', async (req, res) => {
  try {
    const [hmacKey] = await storage.createHmacKey(serviceAccountEmail);
    await hmacKey.setMetadata({
      state: 'INACTIVE'
    });
    await hmacKey.getMetadata();
    await hmacKey.get('ACCESS_KEY');
    await hmacKey.delete();
    res.sendStatus(200);
  } catch (e) {
    log(e);
    res.sendStatus(500);
  }
});

app.post('/hmac-keys-callback', (req, res) => {
  storage.createHmacKey(serviceAccountEmail, (errCreate, hmacKey) => {
    if (errCreate) {
      log(errCreate);
      return res.sendStatus(500);
    }
    hmacKey.setMetadata(
      {
        state: 'INACTIVE'
      },
      errSetMd => {
        if (errSetMd) {
          log(errSetMd);
          return res.sendStatus(500);
        }
        hmacKey.getMetadata(errGetMd => {
          if (errGetMd) {
            log(errGetMd);
            return res.sendStatus(500);
          }
          hmacKey.get('ACCESS_KEY', errGet => {
            if (errGet) {
              log(errGet);
              return res.sendStatus(500);
            }
            hmacKey.delete(errDelete => {
              if (errDelete) {
                log(errDelete);
                return res.sendStatus(500);
              }
              res.sendStatus(200);
            });
          });
        });
      }
    );
  });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function randomBucketName() {
  return `${bucketName}-${uuid()}`;
}

function randomObjectName(prefix) {
  return `${prefix}-${uuid()}`;
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args.unshift(logPrefix);
  console.log.apply(console, args);
}
