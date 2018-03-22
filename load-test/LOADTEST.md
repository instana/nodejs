# Load Tests
This server provides a base to load test the Instana NodeJS sensor.

## Setup Tests
Some of the tests require databases to run locally. The easiest way to run these databases locally is to use Docker and on top of this [Docker Compose](https://docs.docker.com/compose/).    
The command to run these docker containers can be found in our contribution documentation.

### Start the load server
Once the docker container are running, the load server can be started.
```
$ npm run start
```

### Start Jmeter
 [JMeter](https://jmeter.apache.org/) is being used to generate the load. 
 ```
 $ ./jmeter/run.sh
 ```
 
 ### Results
 The results of the load test can be found in `/jmeter/result/testresult`.
