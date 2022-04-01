/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

let logger = require('@instana/core').logger.getLogger('shared-metrics/native-module-retry');

const EventEmitter = require('events');
const copy = require('recursive-copy');
const fs = require('fs');
const os = require('os');
const semver = require('semver');
const path = require('path');
const detectLibc = require('detect-libc');

/**
 * @typedef {Object} InstanaSharedMetricsOptions
 * @property {string} [nativeModuleName]
 * @property {string} [nativeModulePath]
 * @property {string} [nativeModuleParentPath]
 * @property {string} [moduleRoot]
 * @property {string} [message]
 * @property {string} [loadFrom]
 */

const copyPrecompiledDisabled =
  process.env.INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS &&
  process.env.INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS.toLowerCase() === 'false';

const platform = os.platform();
const arch = process.arch;
let { family, GLIBC } = detectLibc;
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
    logger.debug(`Attempt to load native add-on ${opts.nativeModuleName} ${mechanism} has failed.`, e);
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
      logger.warn(`Looking for a precompiled version for ${opts.nativeModuleName} ${label} failed.`, statsErr);
      callback(false);
      return;
    }

    logger.info(`Found a precompiled version for ${opts.nativeModuleName} ${label}, unpacking.`);

    /**
     * tar@6 has dropped support for Node < 10
     * It might work to require tar@6 or to execute commands with tar@6 and Node < 10,
     * but we don't want to risk that a customers application fails - especially if tar@6 adds
     * breaking changes. We decided to disallow this feature.
     */
    if (semver.lt(process.version, '10.0.0')) {
      logger.info(`Skipped copying precompiled version for ${opts.nativeModuleName} ${label} with Node < 10.`);
      callback(false);
      return;
    }

    const tar = require('tar');

    tar
      .x({
        cwd: os.tmpdir(),
        file: precompiledTarGzPath
      })
      .then(() => {
        // See below for the reason why we append 'precompiled' to the path.
        const targetDir = path.join(opts.nativeModulePath, 'precompiled');

        // @ts-ignore
        copy(
          path.join(os.tmpdir(), opts.nativeModuleName),
          targetDir,
          {
            overwrite: true,
            dot: true
          },
          // @ts-ignore
          cpErr => {
            if (cpErr) {
              logger.warn(`Copying the precompiled build for ${opts.nativeModuleName} ${label} failed.`, cpErr);
              callback(false);
              return;
            }

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
            opts.loadFrom = targetDir;
            callback(true);
          }
        );
      })
      .catch(tarErr => {
        logger.warn(`Unpacking the precompiled build for ${opts.nativeModuleName} ${label} failed.`, tarErr);
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
    logger.debug(`Could not find location for ${opts.nativeModuleName}. Will create a path for it.`, e);
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

loadNativeAddOn.setLogger = setLogger;
loadNativeAddOn.selfNodeModulesPath = '';

/**
 * @param {import('@instana/core/src/logger').GenericLogger} _logger
 */
function setLogger(_logger) {
  logger = _logger;
}

module.exports = loadNativeAddOn;
