cd /instana
npm rebuild || echo "Warning: Rebuilding native add-ons for @instana/google-cloud-run failed. Monitoring the Cloud Run service revision instance will work nonetheless, but you will miss some Node.js metrics (GC metrics, event loop metrics, ...). See https://www.ibm.com/docs/de/obi/current?topic=agents-monitoring-google-cloud-run#build-dependencies-and-native-add-ons for details."
