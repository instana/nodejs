/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');
const { fail } = expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const {
  expectAtLeastOneMatching,
  expectExactlyOneMatching,
  getSpansByName,
  retry,
  stringifyItems
} = require('../../../../../../core/test/test_util');

const ProcessControls = require('../../../../test_util/ProcessControls');
const testUtils = require('../../../../../../core/test/test_util');
const globalAgent = require('../../../../globalAgent');

const bucketName = 'nodejs-tracer-test-bucket';
const bucketPrefixRegex = new RegExp(`^${bucketName}-.*$`);

/**
 * This suite is skipped if no GCP project ID has been provided via GPC_PROJECT. It also requires to either have GCP
 * default credentials to be configured, for example via GOOGLE_APPLICATION_CREDENTIALS, or (for CI) to get
 *  the credentials as a string from GOOGLE_APPLICATION_CREDENTIALS_CONTENT.
 *
 * https://console.cloud.google.com/home/dashboard?project=k8s-brewery&pli=1
 *
 * You can find the credentials in 1pwd.
 */
if (
  !process.env.GCP_PROJECT ||
  !(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT)
) {
  describe('tracing/cloud/gcp/storage', function () {
    it('configuration for Google Cloud Platform is missing', () => {
      fail(
        'Please set GCP_PROJECT and GOOGLE_APPLICATION_CREDENTIALS (or GOOGLE_APPLICATION_CREDENTIALS_CONTENT)' +
          ' to enable GCP tests.'
      );
    });
  });
} else {
  let mochaSuiteFn;

  if (!supportedVersion(process.versions.node) || !process.env.GCP_PROJECT) {
    mochaSuiteFn = describe.skip;
  } else {
    mochaSuiteFn = describe;
  }

  mochaSuiteFn('tracing/cloud/gcp/storage', function () {
    this.timeout(config.getTestTimeout() * 2);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true
      });

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });
    after(async () => {
      await controls.stop();
    });

    afterEach(async () => {
      await controls.clearIpcMessages();
    });
    /**
     * auto-retry 3 times, because we run a lot into rate limiting errors
     */
    const MAX_TRIES = 3;

    const run = async (requestPath, tries = 1) => {
      if (tries > MAX_TRIES) {
        return Promise.reject(new Error('Giving up.'));
      }

      tries += 1;

      await agentControls.clearReceivedData();

      return controls
        .sendRequest({
          method: 'POST',
          path: requestPath
        })
        .catch(async err => {
          // 409 - Conflict: The metadata for object \\"file.txt\\" was edited during the operation. Please try again
          // 404 - ApiError: No such object: nodejs-tracer-test-bucket/file.txt (happens if you upload and get too fast)
          // 403 - is subject to bucket's retention policy and cannot be deleted, overwritten or archived until...
          if (err.statusCode === 429 || err.statusCode === 409 || err.statusCode === 404 || err.statusCode === 403) {
            await testUtils.delay(1 * 5000);
            await agentControls.clearReceivedData();
            return run(requestPath, tries);
          }

          throw err;
        });
    };

    ['promise', 'callback'].forEach(apiVariant => {
      [
        {
          pathPrefix: 'storage-createBucket-bucket-delete',
          expectedGcsSpans: [
            {
              operation: 'buckets.insert',
              attributes: {
                bucket: bucketPrefixRegex
              }
            },
            {
              operation: 'buckets.delete',
              attributes: {
                bucket: bucketPrefixRegex
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-create-bucket-delete',
          expectedGcsSpans: [
            {
              operation: 'buckets.insert',
              attributes: {
                bucket: bucketPrefixRegex
              }
            },
            {
              operation: 'buckets.delete',
              attributes: {
                bucket: bucketPrefixRegex
              }
            }
          ]
        },
        {
          pathPrefix: 'storage-get-buckets',
          expectedGcsSpans: [
            {
              operation: 'buckets.list'
            }
          ]
        },
        {
          pathPrefix: 'storage-get-service-account',
          expectedGcsSpans: [
            {
              operation: 'serviceAccount.get'
            }
          ]
        },
        {
          pathPrefix: 'bucket-add-lifecycle-rule',
          expectedGcsSpans: [
            {
              operation: 'buckets.patch',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-combine',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^combine-source-1-.*$/
              }
            },
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^combine-source-2-.*$/
              }
            },
            {
              operation: 'objects.compose',
              attributes: {
                destinationBucket: bucketName,
                destinationObject: /^combine-destination-.*$/
              }
            }
          ]
        },
        // Skipping this usecase because it fails intermittently.
        // {
        //   pathPrefix: 'bucket-combine-error',
        //   expectedGcsSpans: [
        //     {
        //       operation: 'objects.compose',
        //       error: true,
        //       attributes: {
        //         destinationBucket: bucketName,
        //         destinationObject: 'combine-error.gz',
        //         error: /.*Error: Object does-not-exist.*?not found\..*/
        //       }
        //     }
        //   ]
        // },
        {
          pathPrefix: 'bucket-delete-files',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^delete-me-.*/
              }
            },
            {
              operation: 'objects.delete',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-delete-labels',
          expectedGcsSpans: [
            {
              operation: 'buckets.patch',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-exists',
          expectedGcsSpans: [
            {
              operation: 'buckets.get',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-get',
          expectedGcsSpans: [
            {
              operation: 'buckets.get',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-get-files',
          expectedGcsSpans: [
            {
              operation: 'objects.list',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-get-labels',
          expectedGcsSpans: [
            {
              operation: 'buckets.get',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-get-metadata',
          expectedGcsSpans: [
            {
              operation: 'buckets.get',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-get-notifications',
          expectedGcsSpans: [
            {
              operation: 'notifications.get',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-set-and-remove-retention-period',
          expectedGcsSpans: [
            {
              operation: 'buckets.insert',
              attributes: {
                bucket: bucketPrefixRegex
              }
            },
            {
              operation: 'buckets.patch',
              unique: false,
              attributes: {
                bucket: bucketPrefixRegex
              }
            },
            {
              operation: 'buckets.patch',
              unique: false,
              attributes: {
                bucket: bucketPrefixRegex
              }
            },
            {
              operation: 'buckets.delete',
              attributes: {
                bucket: bucketPrefixRegex
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-set-cors-configuration',
          expectedGcsSpans: [
            {
              operation: 'buckets.patch',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-set-labels',
          expectedGcsSpans: [
            {
              operation: 'buckets.patch',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-set-metadata',
          expectedGcsSpans: [
            {
              operation: 'buckets.patch',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-set-storage-class',
          expectedGcsSpans: [
            {
              operation: 'buckets.patch',
              attributes: {
                bucket: bucketName
              }
            }
          ]
        },
        {
          pathPrefix: 'bucket-upload',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: 'test-file.txt'
              }
            }
          ]
        },
        {
          pathPrefix: 'file-copy',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^source-.*$/
              }
            },
            {
              operation: 'objects.rewrite',
              attributes: {
                sourceBucket: bucketName,
                sourceObject: /^source-.*$/,
                destinationBucket: bucketName,
                destinationObject: /^destination-.*$/
              }
            }
          ]
        },
        {
          pathPrefix: 'file-delete',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            },
            {
              operation: 'objects.delete',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            }
          ]
        },
        {
          pathPrefix: 'file-download',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            },
            {
              operation: 'objects.get',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            }
          ]
        },
        {
          pathPrefix: 'file-exists',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            },
            {
              operation: 'objects.get',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            }
          ]
        },
        {
          pathPrefix: 'file-get',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            },
            {
              operation: 'objects.get',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            }
          ]
        },
        {
          pathPrefix: 'file-get-metadata',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            },
            {
              operation: 'objects.get',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            }
          ]
        },
        {
          pathPrefix: 'file-is-public',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            },
            {
              operation: 'objects.get',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            }
          ]
        },
        {
          pathPrefix: 'file-move',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            },
            {
              operation: 'objects.rewrite',
              attributes: {
                sourceBucket: bucketName,
                sourceObject: /^file-.*$/,
                destinationBucket: bucketName,
                destinationObject: /^destination-.*$/
              }
            }
          ]
        },
        {
          pathPrefix: 'file-save',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              unique: false,
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            },
            {
              operation: 'objects.insert',
              unique: false,
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            }
          ]
        },
        {
          pathPrefix: 'file-set-metadata',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            },
            {
              operation: 'objects.patch',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            }
          ]
        },
        {
          pathPrefix: 'file-set-storage-class',
          expectedGcsSpans: [
            {
              operation: 'objects.insert',
              attributes: {
                bucket: bucketName,
                object: /^file-.*$/
              }
            },
            {
              operation: 'objects.rewrite',
              attributes: {
                sourceBucket: bucketName,
                sourceObject: /^file-.*$/,
                destinationBucket: bucketName,
                destinationObject: /^file-.*$/
              }
            }
          ]
        }
      ].forEach(({ pathPrefix, expectedGcsSpans, only, skip }) => {
        // eslint-disable-next-line no-nested-ternary
        const mochaFn = only ? it.only : skip ? it.skip : it;

        mochaFn(`must trace google cloud storage ${pathPrefix} (${apiVariant} API)`, async () => {
          const requestPath = `/${pathPrefix}-${apiVariant}`;

          return run(requestPath).then(() =>
            retry(() => agentControls.getSpans().then(spans => verifySpans(spans, requestPath, expectedGcsSpans)))
          );
        });
      });

      // If this fails with "Service account HMAC key limit reached" then the test has probably been interrupted after
      // creating a key and before deleting it a few times. Go to
      // https://console.cloud.google.com/storage/settings;tab=interoperability
      // to delete HMAC keys for the service account.
      it(`HMAC key operations (${apiVariant} API)`, () => {
        const requestPath = `/hmac-keys-${apiVariant}`;

        return run(requestPath).then(() =>
          retry(() => agentControls.getSpans().then(spans => verifySpansHmacKeys(spans, requestPath)))
        );
      });
    });

    it('file read stream', () => {
      const requestPath = '/file-read-stream';

      return run(requestPath).then(() =>
        retry(() =>
          agentControls.getSpans().then(spans =>
            verifySpans(spans, requestPath, [
              {
                operation: 'objects.insert',
                attributes: {
                  bucket: bucketName,
                  object: /^file-.*$/
                }
              },
              {
                operation: 'objects.get',
                attributes: {
                  bucket: bucketName,
                  object: /^file-.*$/
                }
              }
            ])
          )
        )
      );
    });

    it('file write stream', () => {
      const requestPath = '/file-write-stream';

      return run(requestPath).then(() =>
        retry(() =>
          agentControls.getSpans().then(spans =>
            verifySpans(spans, requestPath, [
              {
                operation: 'objects.insert',
                attributes: {
                  bucket: bucketName,
                  object: /^target-.*$/
                }
              }
            ])
          )
        )
      );
    });

    it('[suppressed] should not trace', async function () {
      await controls.sendRequest({
        method: 'POST',
        path: '/bucket-create-bucket-delete-callback',
        suppressTracing: true
      });

      return testUtils
        .retry(() => testUtils.delay(1000))
        .then(() => agentControls.getSpans())
        .then(spans => {
          if (spans.length > 0) {
            fail(`Unexpected spans ${testUtils.stringifyItems(spans)}.`);
          }
        });
    });

    function verifySpans(spans, requestPath, expectedGcsSpans) {
      const httpEntry = verifyHttpEntry(spans, requestPath);
      const gcsExits = [];
      expectedGcsSpans.forEach(({ operation, attributes, error = false, unique = true }) => {
        const gcsExit = verifyGoogleCloudStorageExit(
          spans,
          httpEntry,
          operation,
          error,
          verifyGcsAttributes(attributes),
          unique,
          gcsExits
        );
        gcsExits.push(gcsExit);
      });
      expect(getSpansByName(spans, 'gcs')).to.have.lengthOf(expectedGcsSpans.length);
      const httpExitSpans = getSpansByName(spans, 'node.http.client');
      if (httpExitSpans.length > 0) {
        // eslint-disable-next-line no-console
        console.log('Unexpected HTTP exit spans', stringifyItems(httpExitSpans));
      }
      expect(httpExitSpans).to.be.empty;
    }

    function verifySpansHmacKeys(spans, requestPath) {
      const httpEntry = verifyHttpEntry(spans, requestPath);
      const gcsExit1 = verifyGoogleCloudStorageExit(spans, httpEntry, 'hmacKeys.create', false);
      const gcsExit2 = verifyGoogleCloudStorageExit(spans, httpEntry, 'hmacKeys.update', false);
      const gcsExit3 = verifyGoogleCloudStorageExit(spans, httpEntry, 'hmacKeys.get', false, null, false);
      const gcsExit4 = verifyGoogleCloudStorageExit(spans, httpEntry, 'hmacKeys.get', false, null, false, [gcsExit3]);
      const gcsExit5 = verifyGoogleCloudStorageExit(spans, httpEntry, 'hmacKeys.delete', false);
      [gcsExit1, gcsExit2, gcsExit3, gcsExit4, gcsExit5].forEach(gcsExit => {
        expect(gcsExit.data.gcs.projectId).to.exist;
        expect(gcsExit.data.gcs.accessId).to.exist;
      });
      expect(getSpansByName(spans, 'gcs')).to.have.lengthOf(5);
      expect(getSpansByName(spans, 'node.http.client')).to.be.empty;
    }

    function verifyGcsAttributes(attributes) {
      const expectations = [];
      if (attributes) {
        Object.keys(attributes).forEach(key => {
          if (attributes[key] instanceof RegExp) {
            expectations.push(span => expect(span.data.gcs[key]).to.match(attributes[key]));
          } else {
            expectations.push(span => expect(span.data.gcs[key]).to.equal(attributes[key]));
          }
        });
        expectations.push(span =>
          expect(Object.keys(span.data.gcs)).to.have.lengthOf(
            // + 1 because span.data.gcs.op is always present
            Object.keys(attributes).length + 1
          )
        );
      } else {
        expectations.push(span => expect(Object.keys(span.data.gcs)).to.have.lengthOf(1));
      }
      return expectations;
    }

    function verifyHttpEntry(spans, url) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.p).to.not.exist,
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.f.e).to.equal(String(controls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.n).to.equal('node.http.server'),
        span => expect(span.data.http.url).to.equal(url)
      ]);
    }

    function verifyGoogleCloudStorageExit(
      spans,
      parent,
      operation,
      error,
      additionalExpectations,
      unique = true,
      otherSpans = null
    ) {
      let expectations = [
        span => expect(span.n).to.equal('gcs'),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.f.e).to.equal(String(controls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.error).to.not.exist,
        span => expect(span.async).to.not.exist,
        span => expect(span.data).to.exist,
        span => expect(span.data.gcs).to.be.an('object'),
        span => expect(span.data.gcs.op).to.equal(operation),
        span => (error ? expect(span.ec).to.equal(1) : expect(span.ec).to.equal(0))
      ];
      if (otherSpans) {
        otherSpans.forEach(other => {
          expectations.push(span => {
            expect(span.s).to.not.equal(other.s);
          });
        });
      }
      if (additionalExpectations) {
        expectations = expectations.concat(additionalExpectations);
      }
      const matchingFunction = unique === false ? expectAtLeastOneMatching : expectExactlyOneMatching;
      return matchingFunction(spans, expectations);
    }
  });
}
