'use strict';

const { expect } = require('chai');

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

const bucketName = 'nodejs-tracer-test-bucket';

// This suite requires GCP credentials and takes very long, thus it is skipped on CI.
const mochaSuiteFn = process.env.CI ? describe.skip : describe;

mochaSuiteFn('tracing/cloud/gcp/storage', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout() * 2);

  agentControls.registerTestHooks();

  const controls = new ProcessControls({
    dirname: __dirname,
    agentControls
  }).registerTestHooks();

  ['promise', 'callback'].forEach(apiVariant => {
    [
      {
        pathPrefix: 'storage-createBucket-bucket-delete',
        expectedGcsSpans: [
          {
            operation: 'buckets.insert',
            attributes: {
              bucket: /^nodejs-tracer-test-bucket-.*$/
            }
          },
          {
            operation: 'buckets.delete',
            attributes: {
              bucket: /^nodejs-tracer-test-bucket-.*$/
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
              bucket: /^nodejs-tracer-test-bucket-.*$/
            }
          },
          {
            operation: 'buckets.delete',
            attributes: {
              bucket: /^nodejs-tracer-test-bucket-.*$/
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
              object: 'combine-source-1.txt'
            }
          },
          {
            operation: 'objects.insert',
            attributes: {
              bucket: bucketName,
              object: 'combine-source-2.txt'
            }
          },
          {
            operation: 'objects.compose',
            attributes: {
              destinationBucket: bucketName,
              destinationObject: 'combine-destination.gz'
            }
          }
        ]
      },
      {
        pathPrefix: 'bucket-combine-error',
        expectedGcsSpans: [
          {
            operation: 'objects.compose',
            error: true,
            attributes: {
              destinationBucket: bucketName,
              destinationObject: 'combine-error.gz',
              error: /.*Error: Object does-not-exist.*?not found\..*/
            }
          }
        ]
      },
      {
        pathPrefix: 'bucket-delete-files',
        expectedGcsSpans: [
          {
            operation: 'objects.insert',
            attributes: {
              bucket: bucketName,
              object: 'delete-me'
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
            operation: 'buckets.patch',
            unique: false,
            attributes: {
              bucket: bucketName
            }
          },
          {
            operation: 'buckets.patch',
            unique: false,
            attributes: {
              bucket: bucketName
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.rewrite',
            attributes: {
              sourceBucket: bucketName,
              sourceObject: 'file.txt',
              destinationBucket: bucketName,
              destinationObject: 'destination.txt'
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.delete',
            attributes: {
              bucket: bucketName,
              object: 'file.txt'
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.get',
            attributes: {
              bucket: bucketName,
              object: 'file.txt'
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.get',
            attributes: {
              bucket: bucketName,
              object: 'file.txt'
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.get',
            attributes: {
              bucket: bucketName,
              object: 'file.txt'
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.get',
            attributes: {
              bucket: bucketName,
              object: 'file.txt'
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.get',
            attributes: {
              bucket: bucketName,
              object: 'file.txt'
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.rewrite',
            attributes: {
              sourceBucket: bucketName,
              sourceObject: 'file.txt',
              destinationBucket: bucketName,
              destinationObject: 'destination.txt'
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.insert',
            unique: false,
            attributes: {
              bucket: bucketName,
              object: 'file.txt'
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.patch',
            attributes: {
              bucket: bucketName,
              object: 'file.txt'
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
              object: 'file.txt'
            }
          },
          {
            operation: 'objects.rewrite',
            attributes: {
              sourceBucket: bucketName,
              sourceObject: 'file.txt',
              destinationBucket: bucketName,
              destinationObject: 'file.txt'
            }
          }
        ]
      }
    ].forEach(({ pathPrefix, expectedGcsSpans, only, skip }) => {
      // eslint-disable-next-line no-nested-ternary
      const mochaFn = only ? it.only : skip ? it.skip : it;

      mochaFn(`must trace google cloud storage ${pathPrefix} (${apiVariant} API)`, () => {
        const path = `/${pathPrefix}-${apiVariant}`;
        return controls
          .sendRequest({
            method: 'POST',
            path
          })
          .then(() => retry(() => agentControls.getSpans().then(spans => verifySpans(spans, path, expectedGcsSpans))));
      });
    });

    // If this fails with "Service account HMAC key limit reached" then the test has probably been interrupted after
    // creating a key and before deleting it a few times. Go to
    // https://console.cloud.google.com/storage/settings;tab=interoperability
    // to delete HMAC keys for the service account.
    it(`HMAC key operations (${apiVariant} API)`, () => {
      const path = `/hmac-keys-${apiVariant}`;
      return controls
        .sendRequest({
          method: 'POST',
          path
        })
        .then(() => retry(() => agentControls.getSpans().then(spans => verifySpansHmacKeys(spans, path))));
    });
  });

  it('file read stream', () => {
    const path = '/file-read-stream';
    return controls
      .sendRequest({
        method: 'POST',
        path
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans =>
            verifySpans(spans, path, [
              {
                operation: 'objects.insert',
                attributes: {
                  bucket: bucketName,
                  object: 'file.txt'
                }
              },
              {
                operation: 'objects.get',
                attributes: {
                  bucket: bucketName,
                  object: 'file.txt'
                }
              }
            ])
          )
        )
      );
  });

  it('file write stream', () => {
    const path = '/file-write-stream';
    return controls
      .sendRequest({
        method: 'POST',
        path
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans =>
            verifySpans(spans, path, [
              {
                operation: 'objects.insert',
                attributes: {
                  bucket: bucketName,
                  object: 'target.txt'
                }
              }
            ])
          )
        )
      );
  });

  function verifySpans(spans, path, expectedGcsSpans) {
    const httpEntry = verifyHttpEntry(spans, path);
    const gcsExits = [];
    expectedGcsSpans.forEach(({ operation, attributes, error = false, unique = true }) => {
      const gcsExit = verifyGoogleCloudStorageExit(
        spans,
        httpEntry,
        operation,
        error,
        verifyGcsAttributes.bind(null, attributes),
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

  function verifySpansHmacKeys(spans, path) {
    const httpEntry = verifyHttpEntry(spans, path);
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

  function verifyGcsAttributes(attributes, gcsExit) {
    if (attributes) {
      Object.keys(attributes).forEach(key => {
        if (attributes[key] instanceof RegExp) {
          expect(gcsExit.data.gcs[key]).to.match(attributes[key]);
        } else {
          expect(gcsExit.data.gcs[key]).to.equal(attributes[key]);
        }
      });
      expect(Object.keys(gcsExit.data.gcs)).to.have.lengthOf(
        // + 1 because span.data.gcs.op is always present
        Object.keys(attributes).length + 1
      );
    } else {
      expect(Object.keys(gcsExit.data.gcs)).to.have.lengthOf(1);
    }
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
    otherSpans
  ) {
    return (unique === false ? expectAtLeastOneMatching : expectExactlyOneMatching)(spans, span => {
      expect(span.n).to.equal('gcs');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.t).to.equal(parent.t);
      expect(span.p).to.equal(parent.s);
      if (otherSpans) {
        otherSpans.forEach(other => expect(span.s).to.not.equal(other.s));
      }
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.error).to.not.exist;
      if (error) {
        expect(span.ec).to.equal(1);
      } else {
        expect(span.ec).to.equal(0);
      }
      expect(span.async).to.not.exist;
      expect(span.data).to.exist;
      expect(span.data.gcs).to.be.an('object');
      expect(span.data.gcs.op).to.equal(operation);
      if (additionalExpectations) {
        additionalExpectations(span);
      }
    });
  }
});
