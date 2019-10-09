#!/usr/bin/env bash
set -eEuo pipefail

cd `dirname $BASH_SOURCE`/..

nohup node . &> demo-app.log &

