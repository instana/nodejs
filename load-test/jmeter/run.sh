#!/bin/bash
rm -rf ./result
mkdir result
jmeter -n -t JMeter.jmx -l result/result.log -e -o result/testresult
