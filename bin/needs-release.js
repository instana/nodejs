#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

// Most of the code is fashioned after what the package conventional-recommended-bump@5.0.1 does. Since we have that
// package (and its dependencies) in our dependencies via lerna/lerna-conventional-commits, we also do not need to
// explicitly add the dependencies we use here (concat-stream, conventional-commits-parser, git-raw-commits,
// git-semver-tags) to our own dev dependencies.

const concat = require('concat-stream');
const conventionalCommitsParser = require('conventional-commits-parser');
const gitRawCommits = require('git-raw-commits');
const gitSemverTags = require('git-semver-tags');

// The distinction between commit types that should trigger a release and those that do not is somewhat arbitrary. We
// might need to revisit it later.
const typesThatTriggerARelease = [
  //
  'feat',
  'fix',
  'perf'
];

// Other types, that will not trigger a release:
// 'build',
// 'chore',
// 'ci',
// 'docs',
// 'style',
// 'refactor',
// 'test'

module.exports = function needsRelease(cb) {
  console.log('Checking if there are commits that should be released as a new version...');

  gitSemverTags((err, tags) => {
    if (err) {
      return cb(err);
    }

    gitRawCommits({
      format: '%B%n-hash-%n%H',
      from: tags[0] || ''
    })
      .pipe(conventionalCommitsParser())
      .pipe(
        concat(data => {
          data = data.filter(commit => typesThatTriggerARelease.includes(commit.type));
          cb(null, data.length);
        })
      );
  });
};

if (require.main === module) {
  module.exports((err, numberOfRelevantCommits) => {
    if (err) {
      console.error(err);
      process.exit(0);
      return;
    }

    if (numberOfRelevantCommits > 0) {
      console.log(
        `There ${numberOfRelevantCommits > 1 ? 'were' : 'was'} ${numberOfRelevantCommits} commit${
          numberOfRelevantCommits > 1 ? 's' : ''
        } with a type from the list [${typesThatTriggerARelease.join(
          ', '
        )}], thus a new release will be published. Terminating with exit code 1.`
      );
      process.exit(1);
    } else {
      console.log(
        `There were no commits with a type from the list [${typesThatTriggerARelease.join(
          ', '
        )}], thus no new release will be published. Terminating with exit code 0.`
      );
      process.exit(0);
    }
  });
}
