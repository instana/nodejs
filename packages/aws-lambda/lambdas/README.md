Example Lambda
==============

Contains a few trivial example lambdas, mainly used to set up quick experiments.

Run bin/create-zips.sh to create zip files for each of them. The resulting zip files can be found in the `zip` subfolder, they can be uploaded to AWS as Lambda definitions.

Before building the lambda zips, the script will first build an archive named instana-aws-lambda.tgz in the root folder of this repository (by running `npm pack`) which is used as a dependency in the example lambdas. Before building the individual zip files, we run npm install in each folder, which unpacks that tgz to the respective node_modules folder.
