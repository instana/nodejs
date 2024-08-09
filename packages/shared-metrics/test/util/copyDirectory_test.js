/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { copyDirectory } = require('../../src/util/nativeModuleRetry');

const createTestDir = (dirPath, files) => {
  fs.mkdirSync(dirPath, { recursive: true });
  files.forEach(file => {
    if (file.isDirectory) {
      createTestDir(path.join(dirPath, file.name), file.contents || []);
    } else {
      fs.writeFileSync(path.join(dirPath, file.name), file.content || '');
    }
  });
};

const deleteTestDir = dirPath => {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach(file => {
      const filePath = path.join(dirPath, file);
      if (fs.statSync(filePath).isDirectory()) {
        deleteTestDir(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    });
    fs.rmdirSync(dirPath);
  }
};

describe('copyDirectory tests', function () {
  const sourceDir = path.join(__dirname, 'source');
  const destDir = path.join(__dirname, 'destination');

  before(() => {
    createTestDir(sourceDir, [
      { name: 'file1.txt', content: 'Content of file1' },
      { name: '.hiddenfile', content: 'Hidden file content' },
      { name: 'largefile.txt', content: 'A'.repeat(1024 * 1024) } // 1MB file
    ]);

    createTestDir(path.join(sourceDir, 'subdir'), [{ name: 'file2.txt', content: 'Content of file2' }]);
    createTestDir(path.join(sourceDir, 'nesteddir'), [
      { name: 'file3.js', content: 'console.log("hello test!");' },
      { name: 'subsubdir', isDirectory: true, contents: [{ name: 'file4.txt', content: 'Content of file4' }] }
    ]);
  });

  after(() => {
    deleteTestDir(sourceDir);
    deleteTestDir(destDir);
  });

  it('should copy directory and its contents recursively', function (done) {
    copyDirectory(sourceDir, destDir);
    setImmediate(() => {
      expect(fs.existsSync(path.join(destDir, 'file1.txt'))).to.be.true;
      expect(fs.readFileSync(path.join(destDir, 'file1.txt'), 'utf8')).to.equal('Content of file1');

      expect(fs.existsSync(path.join(destDir, '.hiddenfile'))).to.be.true;
      expect(fs.readFileSync(path.join(destDir, '.hiddenfile'), 'utf8')).to.equal('Hidden file content');

      expect(fs.existsSync(path.join(destDir, 'largefile.txt'))).to.be.true;
      expect(fs.readFileSync(path.join(destDir, 'largefile.txt'), 'utf8')).to.equal('A'.repeat(1024 * 1024));

      expect(fs.existsSync(path.join(destDir, 'subdir'))).to.be.true;
      expect(fs.existsSync(path.join(destDir, 'subdir', 'file2.txt'))).to.be.true;
      expect(fs.readFileSync(path.join(destDir, 'subdir', 'file2.txt'), 'utf8')).to.equal('Content of file2');

      expect(fs.existsSync(path.join(destDir, 'nesteddir'))).to.be.true;
      expect(fs.existsSync(path.join(destDir, 'nesteddir', 'file3.js'))).to.be.true;
      // eslint-disable-next-line max-len
      expect(fs.readFileSync(path.join(destDir, 'nesteddir', 'file3.js'), 'utf8')).to.equal('console.log("hello test!");');

      expect(fs.existsSync(path.join(destDir, 'nesteddir', 'subsubdir'))).to.be.true;
      expect(fs.existsSync(path.join(destDir, 'nesteddir', 'subsubdir', 'file4.txt'))).to.be.true;
      expect(fs.readFileSync(path.join(destDir, 'nesteddir', 'subsubdir', 'file4.txt'), 'utf8')).to.equal(
        'Content of file4'
      );

      done();
    });
  });

  it('should handle copying to an existing directory by overwriting files', function (done) {
    createTestDir(sourceDir, [{ name: 'file1.txt', content: 'Updated content of file1' }]);
    copyDirectory(sourceDir, destDir);
    setImmediate(() => {
      expect(fs.existsSync(path.join(destDir, 'file1.txt'))).to.be.true;
      expect(fs.readFileSync(path.join(destDir, 'file1.txt'), 'utf8')).to.equal('Updated content of file1');
      done();
    });
  });
});
