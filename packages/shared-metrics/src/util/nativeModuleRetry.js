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
const path = require('path');
const tar = require('tar');
const { fork } = require('child_process');
const detectLibc = require('detect-libc');

const retryMechanisms = [];
if (
  !process.env.INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS ||
  process.env.INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS.toLowerCase() !== 'false'
) {
  retryMechanisms.push('copy-precompiled');
}
if (
  process.env.INSTANA_REBUILD_NATIVE_ADDONS_ON_DEMAND &&
  process.env.INSTANA_REBUILD_NATIVE_ADDONS_ON_DEMAND.toLowerCase() === 'true'
) {
  retryMechanisms.push('rebuild');
}

const platform = os.platform();
const arch = process.arch;
let { family, GLIBC } = detectLibc;
if (!family) {
  // assume glibc if libc family cannot be detected
  family = GLIBC;
}

class ModuleLoadEmitter extends EventEmitter {}

function loadNativeAddOn(opts) {
  const loaderEmitter = new ModuleLoadEmitter();
  // Give clients a chance to register event listeners on the emitter that we return by attempting to load the module
  // asynchronously on the next tick.
  opts.loadFrom = opts.nativeModuleName;
  process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, 0));
  return loaderEmitter;
}

function loadNativeAddOnInternal(opts, loaderEmitter, retryIndex, skipAttempt) {
  try {
    const { isMainThread } = require('worker_threads');
    if (!isMainThread) {
      logger.warn(opts.message + ' (Native addons are currently not loaded in worker threads)');
      loaderEmitter.emit('failed');
      return;
    }
  } catch (err) {
    // worker threads are not available, so we know that this is the main thread
  }

  if (skipAttempt) {
    // The logic of the previous retry mechanism figured out that it cannot complete successfully, so there is no reason
    // to try to require the module again. Skip directly to the next retry.
    logger.debug(`Skipping attempt ${retryIndex + 1} to load native add-on ${opts.nativeModuleName}.`);
    prepareNextRetry(opts, loaderEmitter, retryIndex);
  } else {
    logger.debug(`Attempt ${retryIndex + 1} to load native add-on ${opts.nativeModuleName} from ${opts.loadFrom}.`);
    try {
      // Try to actually require the native add-on module.
      const nativeModule = require(opts.loadFrom);
      loaderEmitter.emit('loaded', nativeModule);
      logger.debug(`Attempt ${retryIndex + 1} to load native add-on ${opts.nativeModuleName} has been successful.`);
    } catch (e) {
      logger.debug(`Attempt ${retryIndex + 1} to load native add-on ${opts.nativeModuleName} has failed.`, e);
      prepareNextRetry(opts, loaderEmitter, retryIndex);
    }
  }
}

function prepareNextRetry(opts, loaderEmitter, retryIndex) {
  // The first pre-condition for all retry mechanisms is that we can find the path to the native add-on that can not be
  // required.
  if (!opts.nativeModulePath || !opts.nativeModuleParentPath) {
    findNativeModulePath(opts);
    if (!opts.nativeModulePath || !opts.nativeModuleParentPath) {
      logger.warn(opts.message + ' (No retry attempted.)');
      loaderEmitter.emit('failed');
      return;
    }
  }

  const nextRetryMechanism = retryMechanisms[retryIndex];
  if (!nextRetryMechanism) {
    // We have exhausted all possible mechanisms to cope with the failure to load the native add-on.
    logger.warn(opts.message);
    loaderEmitter.emit('failed');
  } else if (nextRetryMechanism === 'copy-precompiled') {
    copyPrecompiled(opts, loaderEmitter, retryIndex);
  } else if (nextRetryMechanism === 'rebuild') {
    rebuildOnDemand(opts, loaderEmitter, retryIndex);
  } else {
    logger.error(
      `Unknown retry mechanism for loading the native module ${opts.nativeModuleName}: ${nextRetryMechanism}.`
    );
    process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex, true));
  }
}

function copyPrecompiled(opts, loaderEmitter, retryIndex) {
  logger.debug(`Trying to copy precompiled version of ${opts.nativeModuleName} for Node.js ${process.version}.`);

  const abi = process.versions.modules;
  if (!abi) {
    logger.warn(`Could not determine ABI version for Node.js version ${process.version}.`);
    process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex, true));
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
      process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex, true));
      return;
      // Note: We could combine copying and recompiling for cases where we do not have a precompiled version but
      // node-gyp is available. That is, copy the precompiled package (from an arbitrary architecture/ABI version), then
      // rebuild that.
    } else if (statsErr) {
      logger.warn(`Looking for a precompiled version for ${opts.nativeModuleName} ${label} failed.`, statsErr);
      process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex, true));
      return;
    }

    logger.info(`Found a precompiled version for ${opts.nativeModuleName} ${label}, unpacking.`);

    tar
      .x({
        cwd: os.tmpdir(),
        file: precompiledTarGzPath
      })
      .then(tarErr => {
        if (tarErr) {
          logger.warn(`Unpacking the precompiled build for ${opts.nativeModuleName} ${label} failed.`, tarErr);
          process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex, true));
          return;
        }

        // See below for the reason why we append 'precompiled' to the path.
        const targetDir = path.join(opts.nativeModulePath, 'precompiled');
        copy(
          path.join(os.tmpdir(), opts.nativeModuleName),
          targetDir,
          {
            overwrite: true,
            dot: true
          },
          cpErr => {
            if (cpErr) {
              logger.warn(`Copying the precompiled build for ${opts.nativeModuleName} ${label} failed.`, cpErr);
              process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex, true));
              return;
            }

            // We have unpacked and copied the correct precompiled native addon. The next attempt to require the
            // dependency should work.
            //
            // However, we must not use any of the paths from which Node.js has tried to load the module before (that
            // is, node_modules/${opts.nativeModuleName}). Node.js has module loading infrastructure
            // (lib/internal/modules/cjs/loader.js and lib/internal/modules/package_json_reader.js) have built-in
            // caching on multiple levels (for example, package.json locations and package.json contents). If Node.js
            // has tried unsuccessfully to load a module or read a package.json from a particular path, it will remember
            // and not try to load anything from that path again (a `false` will be put into the cache for that cache
            // key). Instead, we force a new path, by adding precompiled to the module path and use the absolute path to
            // the module to load it.
            opts.loadFrom = targetDir;
            process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex));
          }
        );
      });
  });
}

// This is mainly for the scenario where @instana/collector and its dependencies has been provided by  an external
// mechanism (like copying a bundled version contained in the Instana agent package) without running an npm install on
// the target system. Native addons are present, but might have been build for a different operating system/Node ABI,
// libc familiy, ...). Thus, they need to be rebuilt.
function rebuildOnDemand(opts, loaderEmitter, retryIndex) {
  let nodeGypExecutable;
  try {
    const nodeGypPath = require.resolve('node-gyp');
    if (!nodeGypPath) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Could not find node-gyp (require.resolve didn't return anything) to rebuild ${opts.nativeModuleName} on demand.`
      );
      process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex, true));
      return;
    }
    nodeGypExecutable = path.join(nodeGypPath, '..', '..', 'bin', 'node-gyp.js');
  } catch (e) {
    logger.warn(`Could not load node-gyp to rebuild ${opts.nativeModuleName} on demand.`, e);
    process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex, true));
    return;
  }

  logger.info(`Rebuilding ${opts.nativeModulePath} via ${nodeGypExecutable}.`);
  const nodeGyp = fork(nodeGypExecutable, ['rebuild'], {
    cwd: opts.nativeModulePath
  });
  nodeGyp.on('error', err => {
    logger.warn(
      // eslint-disable-next-line max-len
      `Attempt to rebuild ${opts.nativeModulePath} via ${nodeGypExecutable} has failed with an error.`,
      err
    );
  });
  nodeGyp.on('close', code => {
    if (code === 0) {
      logger.info(
        // eslint-disable-next-line max-len
        `Attempt to rebuild ${opts.nativeModulePath} via ${nodeGypExecutable} has finished, will try to load the module again.`
      );
      // In contrast to copyPrecompiled we do not need to force a different module path here, since in this scenario the
      // package contents (including the package.json) was present in the node_modules folder, it was only the binary
      // that didn't match the platform/ABI version.
      opts.loadFrom = opts.nativeModuleName;
      process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex));
    } else {
      logger.warn(
        `Attempt to rebuild ${opts.nativeModulePath} via ${nodeGypExecutable} has failed with exit code ${code}.`
      );
      process.nextTick(loadNativeAddOnInternal.bind(null, opts, loaderEmitter, ++retryIndex, true));
    }
  });
}

function findNativeModulePath(opts) {
  try {
    // Let's first check if there is at least a module directory in node_modules:
    const nativeModulePath = require.resolve(opts.nativeModuleName);
    if (!nativeModulePath) {
      logger.debug(
        `Could not find location for ${opts.nativeModuleName} (require.resolve didn't return anything). ` +
          'Will create a path for it.'
      );
      createNativeModulePath(opts);
      return;
    }
    // We found a path to the module in node_modules, that means the directory exist (and we will reuse it) but the
    // module installation is incomplete and it could not be loaded earlier (otherwise we wouldn't have gotten here).
    const idx = nativeModulePath.lastIndexOf('node_modules');
    if (idx < 0) {
      logger.warn(`Could not find node_modules substring in ${nativeModulePath}.`);
      return;
    }
    opts.nativeModulePath = nativeModulePath.substring(
      0,
      idx + 'node_modules'.length + opts.nativeModuleName.length + 2
    );
    opts.nativeModuleParentPath = path.join(opts.nativeModulePath, '..');
  } catch (e) {
    logger.debug(`Could not find location for ${opts.nativeModuleName}. Will create a path for it.`, e);
    createNativeModulePath(opts);
  }
}

function createNativeModulePath(opts) {
  // The module cannot be found at all in node_modules. This can happen for example if npm install --no-optional was
  // used but also if building the native add-on with node-gyp failed. We will try to reconstruct a path that makes
  // sense.
  if (!exports.selfNodeModulesPath) {
    const selfPath = path.join(__dirname, '..', '..');
    const idx = selfPath.lastIndexOf('node_modules');
    if (idx < 0) {
      logger.warn(
        `Could not find node_modules substring in ${selfPath}. Will give up loading ${opts.nativeModuleName}.`
      );
      return;
    }

    // cut off everything after module path
    const selfPathNormalized = selfPath.substring(0, idx + 'node_modules'.length + __dirname.length + 2);
    exports.selfNodeModulesPath = path.join(selfPathNormalized, '..', '..');
  }
  // Find nearest ancestor node_modules directory. Since we use a scoped module (@instana/something) as the reference
  // we need to go up two directory levels.
  opts.nativeModuleParentPath = exports.selfNodeModulesPath;
  opts.nativeModulePath = path.join(exports.selfNodeModulesPath, opts.nativeModuleName);
}

module.exports = exports = loadNativeAddOn;

exports.setLogger = function setLogger(_logger) {
  logger = _logger;
};
