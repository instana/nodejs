# Contributing

## Release Process
Sensor releases are a two-stage process. New releases will initially be tagged with `next`. This gives us time to test the behavior of new sensor versions internally, before pushing the changes out to our users. Once verified that the new version is functional (typically by running it in production for a few days at Instana), the `latest` tag is added. All this can be done via `npm` in the following way:

```
npm version (major|minor|patch)
npm publish --tag=next

# once verified that the release works as expected
npm dist-tag add instana-nodejs-sensor@<sensor version> latest

# verify that tags have been correctly applied
npm dist-tag ls instana-nodejs-sensor
```
