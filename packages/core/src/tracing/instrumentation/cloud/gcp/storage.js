/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const shimmer = require('shimmer');

const cls = require('../../../cls');
const constants = require('../../../constants');
const requireHook = require('../../../../util/requireHook');
const tracingUtil = require('../../../tracingUtil');

let isActive = false;

exports.init = function init() {
  requireHook.onModuleLoad('@google-cloud/storage', instrument);
};

const storageInstrumentations = [
  {
    method: 'createBucket',
    operation: 'buckets.insert',
    extractorPre: (gcs, ctx, originalArgs) => {
      gcs.bucket = originalArgs[0];
    }
  },
  {
    method: 'getBuckets',
    operation: 'buckets.list'
  },
  {
    method: 'getServiceAccount',
    operation: 'serviceAccount.get'
  },
  {
    method: 'createHmacKey',
    operation: 'hmacKeys.create',
    extractorPost: (gcs, result) => {
      if (result && result.metadata) {
        gcs.projectId = result.metadata.projectId;
        gcs.accessId = result.metadata.accessId;
      }
    }
  }
];

const bucketInstrumentations = [
  {
    method: 'addLifecycleRule',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'combine',
    operation: 'objects.compose',
    extractorPre: (gcs, ctx, originalArgs) => {
      const destination = originalArgs[1];
      gcs.destinationBucket = bucketNameFromFileOrString(destination, ctx.name);
      gcs.destinationObject = fileNameFromFileOrString(destination);
    }
  },
  {
    method: 'delete',
    operation: 'buckets.delete',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'deleteFiles',
    operation: 'objects.delete',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'deleteLabels',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'disableRequesterPays',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'enableLogging',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'enableRequesterPays',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'exists',
    operation: 'buckets.get',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'get',
    operation: 'buckets.get',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'getFiles',
    operation: 'objects.list',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'getLabels',
    operation: 'buckets.get',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'getMetadata',
    operation: 'buckets.get',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'getNotifications',
    operation: 'notifications.get',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'getSignedUrl',
    operation: 'buckets.get',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'lock',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'makePrivate',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'makePublic',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'removeRetentionPeriod',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'setCorsConfiguration',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'setLabels',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'setMetadata',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'setRetentionPeriod',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'setStorageClass',
    operation: 'buckets.patch',
    extractorPre: bucketNameExtractor
  },
  {
    method: 'upload',
    operation: 'objects.insert',
    extractorPre: (gcs, ctx, originalArgs) => {
      gcs.bucket = ctx.name;
      const options = originalArgs[1] && typeof originalArgs[1] === 'object' ? originalArgs[1] : {};
      gcs.object = options.destination ? options.destination : path.basename(originalArgs[0]);
    }
  }
];

function bucketNameExtractor(gcs, ctx) {
  gcs.bucket = ctx.name;
}

const fileInstrumentations = [
  {
    method: 'copy',
    operation: 'objects.rewrite',
    extractorPre: copyOrMoveExtractor
  },
  {
    method: 'delete',
    operation: 'objects.delete',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'download',
    operation: 'objects.get',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'exists',
    operation: 'objects.get',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'get',
    operation: 'objects.get',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'getExpirationDate',
    operation: 'objects.get',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'getMetadata',
    operation: 'objects.get',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'getSignedUrl',
    operation: 'upload.openSignedUrl',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'isPublic',
    operation: 'objects.get',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'makePublic',
    operation: 'objects.patch',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'makePrivate',
    operation: 'objects.patch',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'move',
    operation: 'objects.rewrite',
    extractorPre: copyOrMoveExtractor
  },
  {
    method: 'rotateEncryptionKey',
    operation: 'objects.patch',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'setMetadata',
    operation: 'objects.patch',
    extractorPre: bucketAndObjectFromFileExtractor
  },
  {
    method: 'setStorageClass',
    operation: 'objects.rewrite',
    extractorPre: (gcs, ctx) => {
      gcs.sourceBucket = ctx.bucket ? ctx.bucket.name : undefined;
      gcs.sourceObject = ctx.name;
      gcs.destinationBucket = ctx.bucket ? ctx.bucket.name : undefined;
      gcs.destinationObject = ctx.name;
    }
  }
];

function bucketAndObjectFromFileExtractor(gcs, ctx) {
  gcs.bucket = ctx.bucket ? ctx.bucket.name : undefined;
  gcs.object = ctx.name;
}

function copyOrMoveExtractor(gcs, ctx, originalArgs) {
  gcs.sourceBucket = ctx.bucket ? ctx.bucket.name : undefined;
  gcs.sourceObject = ctx.name;
  if (typeof originalArgs[0] === 'string') {
    gcs.destinationBucket = ctx.bucket ? ctx.bucket.name : undefined;
    gcs.destinationObject = originalArgs[0];
  } else if (originalArgs[0] && originalArgs[0].constructor && originalArgs[0].constructor.name === 'File') {
    gcs.destinationBucket = originalArgs[0].bucket ? originalArgs[0].bucket.name : undefined;
    gcs.destinationObject = originalArgs[0].name;
  } else if (originalArgs[0] && originalArgs[0].constructor && originalArgs[0].constructor.name === 'Bucket') {
    gcs.destinationBucket = originalArgs[0].name;
    gcs.destinationObject = gcs.sourceObject;
  }
}

const hmacKeyInstrumentations = [
  {
    method: 'delete',
    operation: 'hmacKeys.delete',
    extractorPre: hmacExtractor
  },
  {
    method: 'get',
    operation: 'hmacKeys.get',
    extractorPre: hmacExtractor
  },
  {
    method: 'getMetadata',
    operation: 'hmacKeys.get',
    extractorPre: hmacExtractor
  },
  {
    method: 'setMetadata',
    operation: 'hmacKeys.update',
    extractorPre: hmacExtractor
  }
];

function hmacExtractor(gcs, ctx) {
  if (ctx.metadata) {
    gcs.projectId = ctx.metadata.projectId;
    gcs.accessId = ctx.metadata.accessId;
  }
}

function instrument(storage) {
  if (!storage.Storage) {
    return;
  }

  if (storage.Storage.prototype) {
    storageInstrumentations.forEach(config =>
      shimmer.wrap(
        storage.Storage.prototype,
        config.method,
        shim.bind(null, instrumentedOperation.bind(null, config.operation, config.extractorPre, config.extractorPost))
      )
    );
  }

  if (storage.Bucket.prototype) {
    bucketInstrumentations.forEach(config =>
      shimmer.wrap(
        storage.Bucket.prototype,
        config.method,
        shim.bind(null, instrumentedOperation.bind(null, config.operation, config.extractorPre, config.extractorPost))
      )
    );
  }

  if (storage.File.prototype) {
    fileInstrumentations.forEach(config =>
      shimmer.wrap(
        storage.File.prototype,
        config.method,
        shim.bind(null, instrumentedOperation.bind(null, config.operation, config.extractorPre, config.extractorPost))
      )
    );

    shimmer.wrap(
      storage.File.prototype,
      'createReadStream',
      shim.bind(null, instrumentedCreateStream.bind(null, 'objects.get', 'reading', 'end'))
    );
    shimmer.wrap(
      storage.File.prototype,
      'createWriteStream',
      shim.bind(null, instrumentedCreateStream.bind(null, 'objects.insert', 'writing', 'finish'))
    );
  }

  if (storage.HmacKey.prototype) {
    hmacKeyInstrumentations.forEach(config =>
      shimmer.wrap(
        storage.HmacKey.prototype,
        config.method,
        shim.bind(null, instrumentedOperation.bind(null, config.operation, config.extractorPre, config.extractorPost))
      )
    );
  }
}

function shim(instrumented, original) {
  return function () {
    if (!isActive || !cls.isTracing()) {
      return original.apply(this, arguments);
    }
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    return instrumented(this, original, originalArgs);
  };
}

function instrumentedOperation(operation, extractorPre, extractorPost, ctx, original, originalArgs) {
  const parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return original.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('gcs', constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedOperation, 1);
    span.data.gcs = {
      op: operation
    };

    if (extractorPre) {
      extractorPre(span.data.gcs, ctx, originalArgs);
    }

    const callbackIndex = originalArgs.length - 1;
    if (callbackIndex >= 0 && typeof originalArgs[callbackIndex] === 'function') {
      const originalCallback = originalArgs[callbackIndex];
      originalArgs[callbackIndex] = cls.ns.bind(function (error, result) {
        finishSpan(error, result, span, extractorPost);
        return originalCallback.apply(this, arguments);
      });
    }

    const promise = original.apply(ctx, originalArgs);
    if (promise) {
      promise.then(
        result => finishSpan(null, Array.isArray(result) ? result[0] : result, span, extractorPost),
        e => finishSpan(e, null, span, extractorPost)
      );
    }
    return promise;
  });
}

function instrumentedCreateStream(operation, bindEvent, finalEvent, ctx, original, originalArgs) {
  const parentSpan = cls.getCurrentSpan();
  if (constants.isExitSpan(parentSpan)) {
    return original.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('gcs', constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedCreateStream, 1);
    span.data.gcs = {
      op: operation
    };

    bucketAndObjectFromFileExtractor(span.data.gcs, ctx);

    const stream = original.apply(ctx, originalArgs);
    if (stream) {
      cls.ns.bindEmitter(stream);
      // retroactively bind the existing main listener to keep the cls context
      stream.listeners(bindEvent).forEach(listener => {
        stream.removeListener(bindEvent, listener);
        stream.on(bindEvent, cls.ns.bind(listener));
      });

      stream.on(finalEvent, () => finishSpan(null, null, span));
      stream.on('error', err => finishSpan(err, null, span));
    }
    return stream;
  });
}

function finishSpan(error, result, span, extractorPost) {
  if (error) {
    span.ec = 1;
    span.data.gcs.error = tracingUtil.getErrorDetails(error);
  }

  if (extractorPost) {
    extractorPost(span.data.gcs, result);
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

function fileNameFromFileOrString(file) {
  if (!file) {
    return undefined;
  } else if (typeof file === 'string') {
    return file;
  } else if (file.name) {
    return file.name;
  }
}

function bucketNameFromFileOrString(file, defaultBucket) {
  if (!file) {
    return undefined;
  } else if (typeof file === 'string') {
    return defaultBucket;
  } else if (file.bucket && file.bucket.name) {
    return file.bucket;
  }
  return defaultBucket;
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
