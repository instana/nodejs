# EUM Serverless Collector Example App

## Links

- [Angular CLI](https://github.com/angular/angular-cli)@18.0.5

## Requirements

Create a [website](https://www.ibm.com/docs/en/instana-observability/current?topic=instana-monitoring-websites#installation) on your tenant.

## Run

```sh
npm i

touch website.txt
# Copy the script snippet form the website creation into website.txt
node ./generate.js
npm run start
```

Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Debug

Change `eum.min.js` to `eum.debug.js` and comment out the SHA integrity.