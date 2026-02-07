/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { expect } = require('chai');
const { fail } = expect;

const instrumentEdgemicro = require('@_local/collector/src/bin/instrument-edgemicro-cli');

const pathToEdgemicroDir = path.join(__dirname, 'edgemicroResources');
const pathOfOriginal = path.join(pathToEdgemicroDir, 'cli', 'edgemicro.original');
const pathOfFileToInstrument = path.join(pathToEdgemicroDir, 'cli', 'edgemicro');
const pathOfBackup = `${pathOfFileToInstrument}.backup`;
const pathToCollector = path.resolve(__dirname, '..', '..');
const anotherPathToCollector = `${pathToCollector}/../collector`;

describe('binary to statically instrument the edgemicro cli', () => {
  beforeEach(done => {
    try {
      fs.unlinkSync(pathOfBackup);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        return done(e);
      }
    }
    copyFile(pathOfOriginal, pathOfFileToInstrument, done);
  });

  it('should instrument a pristine file', done => {
    instrumentEdgemicro(pathToEdgemicroDir, pathToCollector, err => {
      if (err) {
        return done(err);
      }
      verifyFileHasBeenInstrumented(pathOfFileToInstrument, done);
    });
  });

  it('should figure out its own path when path to collector is undefined', done => {
    instrumentEdgemicro(pathToEdgemicroDir, undefined, err => {
      if (err) {
        return done(err);
      }
      verifyFileHasBeenInstrumented(pathOfFileToInstrument, done);
    });
  });

  it('should figure out its own path when given only two arguments', done => {
    instrumentEdgemicro(pathToEdgemicroDir, err => {
      if (err) {
        return done(err);
      }
      verifyFileHasBeenInstrumented(pathOfFileToInstrument, done);
    });
  });

  it.skip('should figure out the globally installed edgemicro when given only one argument', done => {
    // This test relies on edgemicro being actually installed as a global npm module. Therefore it is not part of the
    // standard test suite.
    instrumentEdgemicro(err => {
      if (err) {
        return done(err);
      }
      verifyFileHasBeenInstrumented('/path/to/global/node_modules/edgemicro/cli/edgemicro', done);
    });
  });

  it('should create a backup', done => {
    instrumentEdgemicro(pathToEdgemicroDir, pathToCollector, err => {
      if (err) {
        return done(err);
      }

      expect(fs.existsSync(pathOfBackup)).to.be.true;
      const contentOriginal = fs.readFileSync(pathOfOriginal, 'utf8');
      const contentBackup = fs.readFileSync(pathOfBackup, 'utf8');
      expect(contentBackup).to.equal(contentOriginal);
      done();
    });
  });

  it('should replace an existing require-and-init statement', done => {
    // instrument once...
    instrumentEdgemicro(pathToEdgemicroDir, anotherPathToCollector, err1 => {
      if (err1) {
        return done(err1);
      }
      // ...instrument twice...
      instrumentEdgemicro(pathToEdgemicroDir, pathToCollector, err2 => {
        if (err2) {
          return done(err2);
        }

        // check that there is only one require-and-init statement
        verifyFileHasBeenInstrumented(pathOfFileToInstrument, done);
      });
    });
  });

  it('should error out when edgemicro does not exist', done => {
    instrumentEdgemicro('/does/not/exist/edgemicro', pathToCollector, err => {
      if (err) {
        expect(err.code).to.equal('ENOENT');
        return done();
      }
      fail('Expected an ENOENT error');
    });
  });

  it('should error out when the collector does not exist', done => {
    instrumentEdgemicro(pathToEdgemicroDir, '/does/not/exist/collector', err => {
      if (err) {
        expect(err.code).to.equal('ENOENT');
        return done();
      }
      fail('Expected an ENOENT error');
    });
  });
});

function verifyFileHasBeenInstrumented(file, done) {
  fs.readFile(file, 'utf8', (readErr, content) => {
    if (readErr) {
      return done(readErr);
    }
    expect(content).to.contain(`use strict';\nrequire('${pathToCollector}')();\n`);

    // verify the require-and-init line is only there once:
    const matches = content.match(/require\([^()]*collector[^()]*\)/g);
    expect(matches).to.have.lengthOf(1);
    done();
  });
}

function copyFile(source, target, callback) {
  const readStream = fs.createReadStream(source);
  const writeStream = fs.createWriteStream(target);
  writeStream.on('finish', callback);
  readStream.pipe(writeStream);
}
