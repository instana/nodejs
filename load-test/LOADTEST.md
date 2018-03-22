# Load Tests
This server provides a base to load test the Instana NodeJS sensor.

## Setup Tests
Some of the tests require databases to run locally. The easiest way to run these databases locally is to use Docker and on top of this [Docker Compose](https://docs.docker.com/compose/).    
The command to run these docker containers can be found in our contribution documentation.

### Configuration
Whether or not the nodeJS agent should be activated can be configured in `./src/config.js`.
 
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

### Specs
The load test uses 150 threads (users) with a ramp up time of 10s. It is running for 3 minutes.
