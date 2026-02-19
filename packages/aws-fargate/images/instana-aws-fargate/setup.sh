#######################################
# (c) Copyright IBM Corp. 2021
# (c) Copyright Instana Inc. and contributors 2020
#######################################

cd /instana
npm rebuild || echo "Warning: Rebuilding native add-ons for @instana/aws-fargate failed. Monitoring the Fargate tasks will work nonetheless, but you will miss some Node.js metrics (GC metrics, event loop metrics, ...). See https://www.ibm.com/docs/en/instana-observability/current?topic=agents-aws-fargate#build-dependencies-and-native-add-ons for details."
