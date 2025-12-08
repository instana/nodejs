/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { uninstrumentedFs: fs } = require('@instana/core');
const EventEmitter = require('events');
const os = require('os');
const tar = require('tar');
const path = require('path');
const detectLibc = require('detect-libc');

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

/**
 * @typedef {Object} InstanaSharedMetricsOptions
 * @property {string} [nativeModuleName]
 * @property {string} [nativeModulePath]
 * @property {string} [nativeModuleParentPath]
 * @property {string} [moduleRoot]
 * @property {string} [message]
 * @property {string} [loadFrom]
 */

process.env.INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS = 'true';

const copyPrecompiledDisabled =
  process.env.INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS &&
  process.env.INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS.toLowerCase() === 'false';

const platform = os.platform();
const arch = process.arch;

const { GLIBC, familySync } = detectLibc;
let family = familySync();

if (!family) {
  // assume glibc if libc family cannot be detected
  family = GLIBC;
}

class ModuleLoadEmitter extends EventEmitter {}

/**
 * @param {InstanaSharedMetricsOptions} opts
 * @returns {ModuleLoadEmitter}
 */
function loadNativeAddOn(opts) {
  const loaderEmitter = new ModuleLoadEmitter();
  // Give clients a chance to register event listeners on the emitter that we return by attempting to load the module
  // asynchronously on the next tick.
  opts.loadFrom = opts.nativeModuleName;
  process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter));
  return loaderEmitter;
}

/**
 * @param {InstanaSharedMetricsOptions} opts
 * @param {EventEmitter} loaderEmitter
 * @returns {boolean}
 */
function loadNativeAddOnInternal(opts, loaderEmitter) {
  try {
    const { isMainThread } = require('worker_threads');
    if (!isMainThread) {
      // Fail silently, we currently do not want to send any metrics from a worker thread.
      // (But see https://instana.kanbanize.com/ctrl_board/56/cards/48699/details/)
      loaderEmitter.emit('failed');
      return;
    }
  } catch (err) {
    // worker threads are not available, so we know that this is the main thread
  }

  let nativeModuleHasBeenRequiredSuccessfully = attemptRequire(opts, loaderEmitter, 'directly');
  if (!nativeModuleHasBeenRequiredSuccessfully) {
    if (!copyPrecompiledDisabled) {
      copyPrecompiled(opts, loaderEmitter, success => {
        if (success) {
          // The initial attempt to require the native add-on directly has failed but copying the precompiled add-on
          // binaries has been successful. Try to require the precompiled add-on now.
          nativeModuleHasBeenRequiredSuccessfully = attemptRequire(
            opts,
            loaderEmitter,
            'after copying precompiled binaries'
          );
          if (!nativeModuleHasBeenRequiredSuccessfully) {
            // Requiring the precompiled add-on has failed after successfully copying them.
            giveUp(opts, loaderEmitter);
          }
        } else {
          // The initial attempt to require the native add-on directly has failed and copying the precompiled add-on
          // binaries has also failed.
          giveUp(opts, loaderEmitter);
        }
      });
    } else {
      // The initial attempt to require the native add-on directly has failed and copying the precompiled add-on
      // binaries has been explicitly disabled via INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS=false.
      giveUp(opts, loaderEmitter);
    }
  }
}

/**
 * @param {InstanaSharedMetricsOptions} opts
 * @param {EventEmitter} loaderEmitter
 * @param {string} mechanism
 */
function attemptRequire(opts, loaderEmitter, mechanism) {
  try {
    // Try to actually require the native add-on module.
    const nativeModule = require(opts.loadFrom);
    loaderEmitter.emit('loaded', nativeModule);
    logger.debug(`Attempt to load native add-on ${opts.nativeModuleName} ${mechanism} has been successful.`);
    return true;
  } catch (e) {
    logger.debug(
      `Attempt to load native add-on ${opts.nativeModuleName} ${mechanism} has failed. ${e?.message} ${e?.stack}`
    );
    return false;
  }
}

/**
 * @param {InstanaSharedMetricsOptions} opts
 * @param {EventEmitter} loaderEmitter
 */
function giveUp(opts, loaderEmitter) {
  logger.warn(opts.message);
  loaderEmitter.emit('failed');
}

/**
 * @param {InstanaSharedMetricsOptions} opts
 * @param {EventEmitter} loaderEmitter
 * @param {(success: boolean) => void} callback
 */
function copyPrecompiled(opts, loaderEmitter, callback) {
  logger.debug(`Trying to copy precompiled version of ${opts.nativeModuleName} for Node.js ${process.version}.`);

  if (!opts.nativeModulePath || !opts.nativeModuleParentPath) {
    if (!findNativeModulePath(opts)) {
      logger.warn(`Unable to find or construct a path for native add-on ${opts.nativeModuleName}.`);
      process.nextTick(callback.bind(false));
      return;
    }
  }

  const abi = process.versions.modules;
  if (!abi) {
    logger.warn(`Could not determine ABI version for Node.js version ${process.version}.`);
    process.nextTick(callback.bind(false));
    return;
  }

  const label =
    platform === 'linux' ? `(${platform}/${arch}/${family}/ABI ${abi})` : `(${platform}/${arch}/ABI ${abi})`;
  const precompiledPathPrefix = path.join(opts.moduleRoot, 'addons', platform, arch);
  const precompiledTarGzPath =
    platform === 'linux'
      ? path.join(precompiledPathPrefix, family, abi, `${opts.nativeModuleName}.tar.gz`)
      : path.join(precompiledPathPrefix, abi, `${opts.nativeModuleName}.tar.gz`);
  fs.stat(precompiledTarGzPath, statsErr => {
    if (statsErr && statsErr.code === 'ENOENT') {
      logger.info(
        `A precompiled version for ${opts.nativeModuleName} is not available ${label} (at ${precompiledTarGzPath}).`
      );
      callback(false);
      return;
    } else if (statsErr) {
      logger.warn(
        `Looking for a precompiled version for ${opts.nativeModuleName} ${label} failed.
        ${statsErr?.message} ${statsErr?.stack}`
      );
      callback(false);
      return;
    }

    logger.info(`Found a precompiled version for ${opts.nativeModuleName} ${label}, unpacking.`);

    tar
      .x({
        cwd: os.tmpdir(),
        file: precompiledTarGzPath
      })
      .then(() => {
        // See below for the reason why we append 'precompiled' to the path.
        const targetDir = path.join(opts.nativeModulePath, 'precompiled');
        const sourceDir = path.join(os.tmpdir(), opts.nativeModuleName);
        logger.debug(
          `Copying the precompiled build for ${opts.nativeModuleName} ${label} from ${sourceDir} to ${targetDir}.`
        );

        fs.promises
          .cp(sourceDir, targetDir, { recursive: true })
          .then(() => {
            // We have unpacked and copied the correct precompiled native addon. The next attempt to require the
            // dependency should work.
            //
            // However, we must not use any of the paths from which Node.js has tried to load the module before (that
            // is, node_modules/${opts.nativeModuleName}). Node.js' module loading infrastructure
            // (lib/internal/modules/cjs/loader.js and lib/internal/modules/package_json_reader.js) have built-in
            // caching on multiple levels (for example, package.json locations and package.json contents). If Node.js
            // has tried unsuccessfully to load a module or read a package.json from a particular path,
            // it will remember and not try to load anything from that path again (a `false` will be
            // put into the cache for that cache key). Instead, we force a new path, by adding precompiled
            // to the module path and use the absolute path to the module to load it.
            logger.debug(`Successfully copied the precompiled build for ${opts.nativeModuleName} ${label}.`);
            opts.loadFrom = targetDir;
            callback(true);
          })
          .catch(error => {
            // The log triggered when the Instana Node.js collector fails to load a precompiled native module.
            // The collector first attempts to load the module directly; if that fails, it extracts a precompiled
            // version from the instrumentation image, which is currently compiled only for Node.js v21.
            // If the application runs a different Node.js version and the filesystem is read-only, extraction may fail,
            // preventing collection of certain telemetry data (garbage collection and event loop stats).
            // TODO: Fix the issue tracked under INSTA-6673. Ensure prebuilt binaries are available for the
            // corresponding Node.js version.
            logger.debug(
              `Failed to load precompiled build for ${opts.nativeModuleName} ${label}. ` +
                'Precompiled binary extraction has failed, possibly due to a read-only filesystem or an unknown' +
                `system operation error for the Node.js ${process.version}. ${error?.message} ${error?.stack}`
            );
            callback(false);
          });
      })
      .catch(tarErr => {
        logger.warn(`Unpacking the precompiled build for ${opts.nativeModuleName} ${label} failed.
          ${tarErr?.message} ${tarErr?.stack}`);
        callback(false);
      });
  });
}

/**
 * @param {InstanaSharedMetricsOptions} opts
 */
function findNativeModulePath(opts) {
  try {
    // Let's first check if there is at least a module directory in node_modules:
    const nativeModulePath = require.resolve(opts.nativeModuleName);
    if (!nativeModulePath) {
      logger.debug(
        `Could not find location for ${opts.nativeModuleName} (require.resolve didn't return anything). ` +
          'Will create a path for it.'
      );
      return createNativeModulePath(opts);
    }
    // We found a path to the module in node_modules, that means the directory exist (and we will reuse it) but the
    // module installation is incomplete and it could not be loaded earlier (otherwise we wouldn't have gotten here).
    const idx = nativeModulePath.lastIndexOf('node_modules');
    if (idx < 0) {
      logger.warn(`Could not find node_modules substring in ${nativeModulePath}.`);
      return false;
    }
    opts.nativeModulePath = nativeModulePath.substring(
      0,
      idx + 'node_modules'.length + opts.nativeModuleName.length + 2
    );
    opts.nativeModuleParentPath = path.join(opts.nativeModulePath, '..');
    return true;
  } catch (e) {
    logger.debug(
      `Could not find location for ${opts.nativeModuleName}. Will create a path for it. ${e?.message} ${e?.stack}`
    );
    return createNativeModulePath(opts);
  }
}

/**
 * @param {InstanaSharedMetricsOptions} opts
 */
function createNativeModulePath(opts) {
  // The module cannot be found at all in node_modules. This can happen for example if npm install --no-optional was
  // used but also if building the native add-on with node-gyp failed. We will try to reconstruct a path that makes
  // sense.
  if (!loadNativeAddOn.selfNodeModulesPath) {
    const selfPath = path.join(__dirname, '..', '..');
    const idx = selfPath.lastIndexOf('node_modules');
    if (idx < 0) {
      logger.warn(
        `Could not find node_modules substring in ${selfPath}. Will give up loading ${opts.nativeModuleName}.`
      );
      return false;
    }

    // cut off everything after module path
    const selfPathNormalized = selfPath.substring(0, idx + 'node_modules'.length + __dirname.length + 2);
    loadNativeAddOn.selfNodeModulesPath = path.join(selfPathNormalized, '..', '..');
  }
  // Find nearest ancestor node_modules directory. Since we use a scoped module (@instana/something) as the reference
  // we need to go up two directory levels.
  opts.nativeModuleParentPath = loadNativeAddOn.selfNodeModulesPath;
  opts.nativeModulePath = path.join(loadNativeAddOn.selfNodeModulesPath, opts.nativeModuleName);
  return true;
}

loadNativeAddOn.selfNodeModulesPath = '';

exports.loadNativeAddOn = loadNativeAddOn;
