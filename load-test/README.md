# Load Tests
This server provides a base to load test the Instana Node.js sensor.

## Configuration
Application specific configuration options can be found in `./src/config.js`. The most relevant one is `sensorEnabled` which controls whether or not the Node.js sensor is loaded.

## Execution

### Starting required databases, messaging systems…
Start the required databases and middleware as described in the [contribution docs](https://github.com/instana/nodejs-sensor/blob/master/CONTRIBUTING.md).

### Starting the instrumented test application

```
cd load-test
npm run start
```

### Starting the load test
[JMeter](https://jmeter.apache.org/) is being used to generate the load.

```
./jmeter/run.sh
```

## Results
The results of the load test can be found in `./jmeter/result/testresult`.
