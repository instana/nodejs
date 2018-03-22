#!/bin/bash
rm -rf ./result
rm ./jmeter.log
mkdir result
JVM_ARGS="-Xms1024m -Xmx2048m -XX:NewSize=512m -XX:MaxNewSize=1024m"  && export JVM_ARGS && jmeter -n -t JMeter.jmx -l result/result.log -e -o result/testresult
