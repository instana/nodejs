#!/usr/bin/env bash
set -eEuo pipefail

cd `dirname $BASH_SOURCE`/..

pushd .. > /dev/null
pwd
rm -rf instana-serverless-*.tgz
npm --loglevel=warn pack
popd > /dev/null

callback/bin/create-zip.sh
async/bin/create-zip.sh
promise/bin/create-zip.sh
wrapped-callback/bin/create-zip.sh
wrapped-async/bin/create-zip.sh
