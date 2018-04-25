#!/bin/bash

set -eo pipefail

rm -rf ./result ./jmeter.log
mkdir result
export JVM_ARGS="-Xms2048m -Xmx2048m"
jmeter -n \
  -t "test/$TEST.jmx" \
  -l result/result.log \
  -e \
  -o result/testresult \
  -Jjmeter.reportgenerator.report_title="Instana Node.js Load Test" \
  -Jjmeter.reportgenerator.overall_granularity=1000
