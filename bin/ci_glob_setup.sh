#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2021
#######################################


# Each of these environment variables will hold a list of files per CircleCI process to be tested.
# They will be used later by each package where the `test:mocha` script is present
# The `circleci tests glob` command list the files based on the provided glob. A similar result can be achieved without
# their tool, but CircleCI recommends its usage.
# The `circleci tests split` command will split files among the number of designated processes.
# The `--split-by=timings` option looks at the previous build and downloads all result*.xml files. Then, it attempts to
# split files among the process in a way that they finish more or less at the same time.

set -xeo pipefail

cd `dirname $BASH_SOURCE`/..

for package in packages/*/ ; do
  # remove leading "packages/"
  package_name=${package#packages/}
  # remove trailing "/"
  package_name=${package_name%/}
  # replace all "-" by "_"
  package_name=${package_name//-/_}
  # convert lower case to upper case
  package_name="${package_name^^}"

  declare CI_${package_name}_TEST_FILES="$(circleci tests glob "${package}test/**/*test.js" | circleci tests split | sed "s|${package}||g")"
  export CI_${package_name}_TEST_FILES
done
