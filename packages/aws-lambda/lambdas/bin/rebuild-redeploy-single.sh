#!/usr/bin/env bash
set -eEuo pipefail

cd `dirname $BASH_SOURCE`/..

bin/create-zips.sh $1
bin/deploy-demo.sh $1

