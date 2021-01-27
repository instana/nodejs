#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

set -eo pipefail

# We can use this once our changes to license-ls are merged.
licensels="npx license-ls"

# For now, we use a modified version.
licensels="npx github:basti1302/license-ls#extend-report"

nodejs_collector_homedir="$( cd `dirname $BASH_SOURCE`/.. && pwd )"

cd $nodejs_collector_homedir

tmpdir=$(mktemp -d)
echo "Using temporary directory: $tmpdir"
pushd $tmpdir > /dev/null

echo "Installing all user facing packages into temporary directory..."
npm install --prod @instana/collector @instana/aws-lambda @instana/aws-fargate @instana/google-cloud-run

$licensels --format csv --include name,version,licenseIdWithoutVersion,licenseVersion,copyrightHolder,copyrightYear,licenseLink > $nodejs_collector_homedir/nodejs-license-report.csv

popd > /dev/null

echo "Removing temporary directory: $tmpdir"
rm -rf $tmpdir

