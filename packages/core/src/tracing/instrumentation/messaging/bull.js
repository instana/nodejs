/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('shimmer');
const cls = require('../../cls');
const { ENTRY, EXIT, isExitSpan } = require('../../constants');
const requireHook = require('../../../util/requireHook');
const tracingUtil = require('../../tracingUtil');
const { getFunctionArguments } = require('../../../util/function_arguments');

let logger = require('../../../logger').getLogger('tracing/bull', newLogger => {
  logger = newLogger;
});

let isActive = false;

exports.spanName = 'bull';

exports.init = function init() {
  requireHook.onModuleLoad('bull', instrumentBull);
};

function instrumentBull(Bull) {
  shimmer.wrap(Bull.Job, 'create', shimJobCreate);
  shimmer.wrap(Bull.Job, 'createBulk', shimJobCreateBulk);
  shimmer.wrap(Bull.prototype, 'processJob', shimProcessJob);
}

function shimJobCreate(originalJobCreate) {
  return function () {
    if (isActive) {
      const originalArgs = getFunctionArguments(arguments);

      return instrumentedJobCreate(this, originalJobCreate, originalArgs);
    }

    return originalJobCreate.apply(this, arguments);
  };
}

// Immediate jobs and repeatable jobs are caught here, bulked or not
function instrumentedJobCreate(ctx, originalJobCreate, originalArgs) {
  // Job.create args: Queue data, job name or ctx.DEFAULT_JOB_NAME, job data, options

  // queue name should always be found, as it's required in order to start the whole process
  const queueName = (originalArgs[0] && originalArgs[0].name) || 'name not found';
  const options = originalArgs[3];
  const repeatableJob = options && typeof options.jobId === 'string' && options.jobId.indexOf('repeat') === 0;

  /**
   * Repeatable jobs work in a different way than regular ones.
   * One single job is created with the repeat options, but the upcoming repetitions will lose the supression,
   * making cls.tracingSuppressed() to return false.
   * But repeated jobs have the instana header X_INSTANA_L properly set, which is why we include this check here.
   */
  if (cls.tracingSuppressed() || (repeatableJob && options.X_INSTANA_L === '0')) {
    propagateSuppression(options);
    return originalJobCreate.apply(ctx, originalArgs);
  }

  const parentSpan = cls.getCurrentSpan();

  /**
   * Repeatable jobs cannot be persisted to a parent span, since we don't know for how long they will run.
   * The backend won't hold a reference to the parent entry span for too long, which will then make this span orphan.
   * So we send repeatable jobs as root span.
   */
  if ((!parentSpan && !repeatableJob) || isExitSpan(parentSpan)) {
    return originalJobCreate.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    // inherit parent if exists. eg: ENTRY http server
    // or is root if no parent present
    const span = cls.startSpan(exports.spanName, EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedJobCreate, 1);
    span.data.bull = {
      sort: 'exit',
      queue: queueName
    };

    propagateTraceContext(options, span);

    const promise = originalJobCreate.apply(ctx, originalArgs);

    return promise
      .then(job => {
        finishSpan(null, job, span);
        return job;
      })
      .catch(err => {
        finishSpan(err, null, span);
        return err;
      });
  });
}

function shimJobCreateBulk(originalJobCreateBulk) {
  return function () {
    if (isActive) {
      const originalArgs = getFunctionArguments(arguments);

      return instrumentedJobCreateBulk(this, originalJobCreateBulk, originalArgs);
    }

    return originalJobCreateBulk.apply(this, arguments);
  };
}

function instrumentedJobCreateBulk(ctx, originalJobCreateBulk, originalArgs) {
  // Job.createBulk args: Queue data, list of jobs

  // queue name should always be found, as it's required in order to start the whole process
  const queueName = (originalArgs[0] && originalArgs[0].name) || 'name not found';

  // Repeatable jobs are not supported by addBulk and their instrumentation will look broken, if provided.
  // Immediate (non repeatable) jobs will be processed right now, so we can properly instrument them.
  /** @type {Array<import('bull').Job>} */
  const immediateJobs = originalArgs[1] || [];

  if (cls.tracingSuppressed()) {
    immediateJobs.forEach(job => {
      propagateSuppression(job.opts);
    });

    return originalJobCreateBulk.apply(ctx, originalArgs);
  }

  const parentSpan = cls.getCurrentSpan();

  immediateJobs.forEach(job => {
    if (parentSpan && !isExitSpan(parentSpan)) {
      cls.ns.run(() => {
        const span = cls.startSpan(exports.spanName, EXIT);
        span.ts = Date.now();
        span.stack = tracingUtil.getStackTrace(instrumentedJobCreateBulk, 2);
        span.data.bull = {
          sort: 'exit',
          queue: queueName
        };
        const options = job.opts;

        propagateTraceContext(options, span);

        finishSpan(null, job.data, span);
      });
    }
  });

  return originalJobCreateBulk.apply(ctx, originalArgs);
}

function shimProcessJob(originalProcessJob) {
  return function () {
    if (isActive) {
      const originalArgs = getFunctionArguments(arguments);

      return instrumentedProcessJob(this, originalProcessJob, originalArgs);
    }
    return originalProcessJob.apply(this, arguments);
  };
}

function instrumentedProcessJob(ctx, originalProcessJob, originalArgs) {
  // originalArgs = job, notFetch = false
  /** @type {import('bull').Job} */
  const job = originalArgs[0];

  if (!job) {
    return originalProcessJob.apply(ctx, originalArgs);
  }

  const options = job.opts || {};
  const jobId = options.jobId;
  const queueName = job.queue && job.queue.name;

  return cls.ns.runPromise(() => {
    let attributes = {};

    if (options[jobId]) {
      attributes = options[jobId];
      // make sure the instana foreigner data is removed before job is processed
      delete options[jobId];

      /**
       * When a job is repeatable, we add our data in a key whose name is the job id.
       * This happens in the initial job options, but it will be replicated to the next jobs.
       * This causes the non original jobs to have 2 keys: The correct one and the original one,
       * so we need to remove the original one, otherwise, job options will have undesirable Instana data.
       */
      if (options.repeat) {
        removeOriginalJobInstanaData(options);
      }
    } else if (options.instanaTracingContext) {
      attributes = options.instanaTracingContext;
      // make sure the instana foreigner data is removed before job is processed
      delete options.instanaTracingContext;
    }

    if (options.X_INSTANA_L === '0') {
      cls.setTracingLevel('0');
      delete options.X_INSTANA_L;
      return originalProcessJob.apply(ctx, originalArgs);
    }
    delete options.X_INSTANA_L;

    const spanT = attributes.X_INSTANA_T;
    const spanP = attributes.X_INSTANA_S;

    const parentSpan = cls.getCurrentSpan();

    if ((parentSpan && parentSpan.p === spanP && parentSpan.t === spanT) || (parentSpan && parentSpan.n !== 'bull')) {
      // We allow a new entry span even if there is already an active entry span, because repeatable and bulked jobs can
      // run in parallel if concurrency is enabled.
      // But here we check if the job parent span data is the same as the existent span. In this case, we don't
      // instrument.
      logger.warn(`Cannot start a Bull entry span when another span is already active: ${JSON.stringify(parentSpan)}`);

      return originalProcessJob.apply(ctx, originalArgs);
    }

    const span = cls.startSpan(exports.spanName, ENTRY, spanT, spanP);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedProcessJob, 1);
    span.data.bull = {
      sort: 'entry',
      queue: queueName
    };

    const promise = originalProcessJob.apply(ctx, originalArgs);

    return promise
      .then(data => {
        finishSpan(job.failedReason, data, span);
        return data;
      })
      .catch(err => {
        addErrorToSpan(err, span);
        finishSpan(null, null, span);
        throw err;
      })
      .finally(() => {
        // Make sure the instana foreigner data is removed.
        delete options.X_INSTANA_L;
      });
  });
}

/**
 * @param {import('bull').JobOptions} options
 */
function removeOriginalJobInstanaData(options) {
  const repeatableKeys = Object.keys(options).filter(key => key.indexOf('repeat') === 0);

  repeatableKeys.forEach(k => {
    delete options[k];
  });
}

function propagateSuppression(options) {
  /**
   * For the suppression flag, we don't need to care about the job id.
   * This was introduced before because of repeated jobs, but the suppression propagation happens only for the
   * original job. The original job has the repetition option inside. We need to handle this in a separate step
   */
  options.X_INSTANA_L = '0';
}

function propagateTraceContext(options, span) {
  options.X_INSTANA_L = '1';
  if (options.jobId) {
    options[options.jobId] = {
      X_INSTANA_T: span.t,
      X_INSTANA_S: span.s
    };
  } else {
    options.instanaTracingContext = {
      X_INSTANA_T: span.t,
      X_INSTANA_S: span.s
    };
  }
}

function finishSpan(err, data, span) {
  if (err) {
    addErrorToSpan(err, span);
  }
  if (typeof data === 'string') {
    span.data.bull.messageId = data;
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

function addErrorToSpan(err, span) {
  if (err) {
    span.ec = 1;
    if (err.code) {
      span.data.bull.error = err.code;
    } else if (typeof err === 'string') {
      span.data.bull.error = err;
    }
  }
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
