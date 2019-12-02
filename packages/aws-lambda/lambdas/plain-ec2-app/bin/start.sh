#!/usr/bin/env bash
set -xeEuo pipefail

cd `dirname $BASH_SOURCE`/..

nohup bash -c "exec -a demo-app node ." &> demo-app.log &
