/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

require('../../../../../')();

const async_ = require('async');
const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const morgan = require('morgan');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const uuid = require('uuid/v4');

const asyncRoute = require('../../../../test_util/asyncExpressRoute');

const logPrefix = `Google Cloud Storage Client (${process.pid}):\t`;

const storage = new Storage();

const port = process.env.APP_PORT || 3215;
const bucketName = 'nodejs-tracer-test-bucket';
const fileName = 'test-file.txt';
const localFileName = path.join(__dirname, fileName);
const serviceAccountEmail = 'team-nodejs@k8s-brewery.iam.gserviceaccount.com';

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  return res.sendStatus(200);
});

app.post(
  '/storage-createBucket-bucket-delete-promise',
  asyncRoute(async (req, res) => {
    try {
      const randomBucketName = `${bucketName}-${uuid()}`;
      const [bucket] = await storage.createBucket(randomBucketName);
      await bucket.delete();
      res.sendStatus(200);
    } catch (e) {
      log(e);
      res.sendStatus(500);
    }
  })
);

app.post('/storage-createBucket-bucket-delete-callback', (req, res) => {
  const randomBucketName = `${bucketName}-${uuid()}`;
  storage.createBucket(randomBucketName, (errCreate, bucket) => {
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

app.post(
  '/bucket-create-bucket-delete-promise',
  asyncRoute(async (req, res) => {
    try {
      const randomBucketName = `${bucketName}-${uuid()}`;
      const bucket = storage.bucket(randomBucketName);
      await bucket.create();
      await bucket.delete();
      res.sendStatus(200);
    } catch (e) {
      log(e);
      res.sendStatus(500);
    }
  })
);

app.post('/bucket-create-bucket-delete-callback', (req, res) => {
  const randomBucketName = `${bucketName}-${uuid()}`;
  storage.createBucket(randomBucketName, (errCreate, bucket) => {
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

app.post(
  '/storage-get-buckets-promise',
  asyncRoute(async (req, res) => {
    try {
      await storage.getBuckets();
      res.sendStatus(200);
    } catch (e) {
      log(e);
      res.sendStatus(500);
    }
  })
);

app.post('/storage-get-buckets-callback', (req, res) => {
  storage.getBuckets(err => {
    if (err) {
      log(err);
      return res.sendStatus(500);
    }
    res.sendStatus(200);
  });
});

app.post(
  '/storage-get-service-account-promise',
  asyncRoute(async (req, res) => {
    try {
      await storage.getServiceAccount();
      res.sendStatus(200);
    } catch (e) {
      log(e);
      res.sendStatus(500);
    }
  })
);

app.post('/storage-get-service-account-callback', (req, res) => {
  storage.getServiceAccount(err => {
    if (err) {
      log(err);
      return res.sendStatus(500);
    }
    res.sendStatus(200);
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
            action: 'delete',
            condition: {
              age: 365
            }
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
        args: [localFileName, { destination: 'combine-source-1.txt', gzip: true }]
      },
      {
        method: 'upload',
        args: [localFileName, { destination: 'combine-source-2.txt', gzip: true }]
      },
      {
        method: 'combine',
        args: [['combine-source-1.txt', 'combine-source-2.txt'], 'combine-destination.gz']
      }
    ]
  },
  {
    pathPrefix: 'delete-files',
    actions: [
      {
        method: 'upload',
        args: [localFileName, { destination: 'delete-me', gzip: true }]
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
    pathPrefix: 'set-and-remove-retention-period',
    actions: [
      {
        method: 'setRetentionPeriod',
        args: [1]
      },
      {
        method: 'removeRetentionPeriod'
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
  app.post(
    `/bucket-${pathPrefix}-promise`,
    asyncRoute(async (req, res) => {
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
    })
  );

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

app.post(
  '/bucket-combine-error-promise',
  asyncRoute(async (req, res) => {
    try {
      const bucket = storage.bucket(bucketName);
      await bucket.combine(['does-not-exist-1.txt', 'does-not-exist-2.txt'], 'combine-error.gz');
      log('Operation bucket.combine succeeded although it should not have succeeded.');
      res.sendStatus(500);
    } catch (e) {
      res.sendStatus(200);
    }
  })
);

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
    uploadName: 'file.txt',
    actions: [
      {
        method: 'copy',
        args: ['destination.txt']
      }
    ]
  },
  {
    pathPrefix: 'delete',
    uploadName: 'file.txt',
    actions: [
      {
        method: 'delete'
      }
    ]
  },
  {
    pathPrefix: 'download',
    uploadName: 'file.txt',
    actions: [
      {
        method: 'download'
      }
    ]
  },
  {
    pathPrefix: 'exists',
    uploadName: 'file.txt',
    actions: [
      {
        method: 'exists'
      }
    ]
  },
  {
    pathPrefix: 'get',
    uploadName: 'file.txt',
    actions: [
      {
        method: 'get'
      }
    ]
  },
  {
    pathPrefix: 'get-metadata',
    uploadName: 'file.txt',
    actions: [
      {
        method: 'getMetadata'
      }
    ]
  },
  {
    pathPrefix: 'is-public',
    uploadName: 'file.txt',
    actions: [
      {
        method: 'isPublic'
      }
    ]
  },
  {
    pathPrefix: 'move',
    uploadName: 'file.txt',
    actions: [
      {
        method: 'move',
        args: ['destination.txt']
      }
    ]
  },
  {
    pathPrefix: 'save',
    uploadName: 'file.txt',
    actions: [
      {
        method: 'save',
        args: ['some data']
      }
    ]
  },
  {
    pathPrefix: 'set-metadata',
    uploadName: 'file.txt',
    actions: [
      {
        method: 'setMetadata',
        args: [{}]
      }
    ]
  },
  {
    pathPrefix: 'set-storage-class',
    uploadName: 'file.txt',
    actions: [
      {
        method: 'setStorageClass',
        args: ['standard']
      }
    ]
  }
];

fileRoutes.forEach(({ pathPrefix, uploadName, actions }) => {
  app.post(
    `/file-${pathPrefix}-promise`,
    asyncRoute(async (req, res) => {
      try {
        const bucket = storage.bucket(bucketName);
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
    })
  );

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

app.post(
  '/file-read-stream',
  asyncRoute(async (req, res) => {
    const bucket = storage.bucket(bucketName);
    const [remoteSource] = await bucket.upload(localFileName, { destination: 'file.txt', gzip: true });
    const localTarget = path.join(__dirname, 'read-stream-target.txt');
    remoteSource
      .createReadStream()
      .on('error', err => {
        log(err);
        res.sendStatus(500);
      })
      .on('end', () => res.sendStatus(200))
      .pipe(fs.createWriteStream(localTarget));
  })
);

app.post('/file-write-stream', async (req, res) => {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file('target.txt');
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

app.post(
  '/hmac-keys-promise',
  asyncRoute(async (req, res) => {
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
  })
);

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

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args.unshift(logPrefix);
  console.log.apply(console, args);
}
