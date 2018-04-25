# Load Tests


## Starting the App
The app can be started via `./runApps.bash`. It is configured via environment variables. The default values for the
environment variables can be seen in `.env`. The defaults can be easily overwritten like this `AGENT_PORT=3210 ./runApps.bash`.

### With Dummy Agent
The agent doesn't play a relevant role in the majority of load tests. For this reason, it is possible to execute the
load tests without the real agent. It can be done in the following way

```
# start the agent stub
cd nodejs-sensor
DROP_DATA=true npm run agent-stub

# start the app (in a separate terminal)
cd nodejs-sensor/load
AGENT_PORT=3210 ./runApps.bash
```

## Executing Load Tests

1. [Download JMeter](https://jmeter.apache.org/download_jmeter.cgi) and extract it. Put the `bin/` directory on your path.
2. Execute a load test: `TEST=httpCallSequence ./runLoadTest.bash`.
3. Check the results: `open result/testresult/index.html`.
