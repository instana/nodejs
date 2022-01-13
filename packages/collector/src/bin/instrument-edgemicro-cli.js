#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable no-console, max-len */

'use strict';

// The purpose of this executable is to statically instrument a _global_ installation of Apigee's edgemicro/Microgateway
// package (https://www.npmjs.com/package/edgemicro). In its default installation scenario (that is advertised in the
// basic tutorials, for example), the edgemicro npm module is installed globally via npm install -g edgemicro. To start
// the edgemicro Node.js process, the main executable of this globally installed package is used, like this:
// edgemicro start -o $org -e $env -k $key -s $secret
//
// Thus, there is no user controlled code when that Node.js process is starting up, and in turn our usual installation
// documented at https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation can not be performed (in particular, there
// is no user controlled code to put the require('@instana/collector')(); into.
//
// The purpose of this executable is to fill this gap. It needs to be called after the edgemicro package has been
// installed. The package @instana/collector also needs to be installed. This executable will statically instrument the
// edgemicro main CLI source file and put the require('@instana/collector')(); into the right place. Naturally, this
// needs to be repeated after an update/reinstallation of the edgemicro package.
//
// This executable is not needed for installation scenarios where user code is started first that then requires for
// example microgateway-core (https://github.com/apigee/microgateway-core).
//
// Why don't we simply add our require-and-init via an edgemicro plug-in? Because the plug-in code is evaluated too
// late, after the workers have been already started. Thus, the instrumentation in
// core/src/tracing/process/edgemicro.js and core/src/tracing/process/childProcess isn't active when workers are
// started. The plug-in code would also be evaluated in each worker process, but again, too late, that is tracing would
// only work partially.

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const selfPath = require('./selfPath');

const edgemicroCliMain = 'cli/edgemicro';

/**
 * @param {string | ((err?: Error) => *) | undefined} edgemicroPath
 * @param {string | ((err?: Error) => *) | undefined} collectorPath
 * @param {(err?: Error) => * | undefined} callback
 * @returns
 */
function instrumentEdgemicroCli(edgemicroPath, collectorPath, callback) {
  if (typeof edgemicroPath === 'function') {
    callback = edgemicroPath;
    edgemicroPath = undefined;
    collectorPath = undefined;
  }
  if (typeof collectorPath === 'function') {
    callback = collectorPath;
    collectorPath = undefined;
  }

  if (!callback) {
    throw new Error('Mandatory argument callback is missing.');
  }
  if (typeof callback !== 'function') {
    throw new Error(`The callback argument is not a function but of type ${typeof callback}.`);
  }

  if (!edgemicroPath) {
    console.log('- Path to edgemicro has not been provided, I will try to figure it out now.');
    const globalNodeModules = childProcess.execSync('npm root -g').toString().trim();
    console.log('    * Global node_modules directory:', globalNodeModules);

    edgemicroPath = path.join(globalNodeModules, 'edgemicro');
    if (!fs.existsSync(edgemicroPath)) {
      return callback(
        new Error(
          `It seems there is no edgemicro installation at ${edgemicroPath}. You can also provide the path to your edgemicro installation explicitly as a command line argument.`
        )
      );
    }
    console.log('    * Global edgemicro installation should be in:', edgemicroPath);
    console.log('- Path to edgemicro has not been provided, I will assume it is:', edgemicroPath);
  }
  if (typeof edgemicroPath !== 'string') {
    return callback(new Error(`The path to edgemicro needs to be a string but was of type ${typeof edgemicroPath}`));
  }

  if (!collectorPath) {
    collectorPath = selfPath.collectorPath;
    console.log('- Path to @instana/collector has not been provided, I will assume it is:', collectorPath);
  }
  if (typeof collectorPath !== 'string') {
    return callback(
      new Error(`The path to @instana/collector needs to be a string but was of type ${typeof collectorPath}.`)
    );
  }

  console.log('- Provided arguments:');
  console.log('    * Path to the edgemicro package:', edgemicroPath);
  if (!path.isAbsolute(edgemicroPath)) {
    edgemicroPath = path.resolve(edgemicroPath);
    console.log('    * resolved absolute path for edgemicro package:', edgemicroPath);
  }
  console.log('    * Path to the @instana/collector:', collectorPath);
  if (!path.isAbsolute(collectorPath)) {
    collectorPath = path.resolve(collectorPath);
    console.log('    * resolved absolute path for @instana/collector:', collectorPath);
  }

  console.log(`- Checking if @instana/collector exists at ${collectorPath}.`);
  fs.access(collectorPath, fs.constants.F_OK, fsAccessError => {
    if (fsAccessError) {
      console.log(fsAccessError);
      return callback(fsAccessError);
    }

    try {
      const collectorPackageJson = require(path.join(/** @type {string} */ (collectorPath), 'package.json'));
      if (collectorPackageJson.name !== '@instana/collector') {
        return callback(
          new Error(
            `The provided path for @instana/collector does not seem to be valid, expected the package name to be @instana/collector, instead the name "${collectorPackageJson.name}" has been found.`
          )
        );
      }
    } catch (packageJsonError) {
      return callback(
        new Error(
          `The provided path for @instana/collector does not seem to be valid, there is no package.json at the expected location or it cannot be parsed: ${packageJsonError.stack}`
        )
      );
    }

    const edgemicroCliMainFullPath = path.resolve(/** @type {string} */ (edgemicroPath), edgemicroCliMain);
    console.log('- Will instrument the following file:', edgemicroCliMainFullPath);

    createBackupAndInstrument(edgemicroCliMainFullPath, /** @type {string} */ (collectorPath), callback);
  });
}

module.exports = instrumentEdgemicroCli;

/**
 * @param {string} edgemicroCliMainFullPath
 * @param {string} collectorPath
 * @param {(err?: Error) => *} callback
 */
function createBackupAndInstrument(edgemicroCliMainFullPath, collectorPath, callback) {
  const backupFullPath = `${edgemicroCliMainFullPath}.backup`;
  console.log('- Creating a backup at:', backupFullPath);
  copyFile(edgemicroCliMainFullPath, backupFullPath, copyErr => {
    if (copyErr) {
      console.error(copyErr);
      return callback(copyErr);
    }
    instrument(edgemicroCliMainFullPath, collectorPath, callback);
  });
}

/**
 * @param {string} source
 * @param {string} target
 * @param {(err?: Error) => *} copyCallback
 */
function copyFile(source, target, copyCallback) {
  let callbackHasBeenCalled = false;
  const readStream = fs.createReadStream(source);
  const writeBackupStream = fs.createWriteStream(target);
  readStream.on('error', err => {
    if (!callbackHasBeenCalled) {
      callbackHasBeenCalled = true;
      copyCallback(err);
    }
  });
  writeBackupStream.on('error', err => {
    if (!callbackHasBeenCalled) {
      callbackHasBeenCalled = true;
      copyCallback(err);
    }
  });
  writeBackupStream.on('finish', () => {
    if (!callbackHasBeenCalled) {
      callbackHasBeenCalled = true;
      copyCallback();
    }
  });
  readStream.pipe(writeBackupStream);
}

/**
 * @param {string} fileToBeInstrumented
 * @param {string} collectorPath
 * @param {(err?: Error) => *} callback
 */
function instrument(fileToBeInstrumented, collectorPath, callback) {
  console.log('- Reading:', fileToBeInstrumented);
  fs.readFile(fileToBeInstrumented, 'utf8', (readErr, content) => {
    if (readErr) {
      console.error(readErr);
      return callback(readErr);
    }

    let result;

    const match = /\nrequire[^\n]*collector[^\n]*\n/.exec(content);
    if (match) {
      result = `${content.substring(0, match.index + 1)}require('${collectorPath}')();\n${content.substring(
        match.index + match[0].length
      )}`;
    } else {
      result = content.replace(/\n'use strict';\n/, `\n'use strict';\nrequire('${collectorPath}')();\n`);
    }

    console.log('- Writing:', fileToBeInstrumented);
    fs.writeFile(fileToBeInstrumented, result, 'utf8', writeErr => {
      if (writeErr) {
        console.error(writeErr);
        return callback(writeErr);
      }

      callback();
    });
  });
}

if (require.main === module) {
  // The file is running as a script, kick off the instrumentation directly.
  module.exports(process.argv[2], process.argv[3], err => {
    if (err) {
      console.error('Failed to instrument the edgemicro module', err);
      process.exit(1);
    }
    console.log(
      '- Done: The edgemicro module has been statically instrumented for Instana tracing and metrics collection.'
    );
  });
} else {
  if (
    // @ts-ignore - TS doesn't recognize the internal properties of module
    module.parent &&
    // @ts-ignore
    typeof module.parent.id === 'string' &&
    // @ts-ignore
    module.parent.id.indexOf('instrument_edgemicro_cli_test') >= 0
  ) {
    // skip printing warnings in tests
    // @ts-ignore - A 'return' statement can only be used within a function body
    return;
  }

  // Not running as a script, wait for client code to trigger the instrumentation.
  console.warn(
    `The file ${path.join(
      __dirname,
      'instrument-edgemicro-cli.js'
    )} has been required by another module instead of being run directly as a script. You need to call the exported function yourself to start the instrumentation in this scenario.`
  );
}
