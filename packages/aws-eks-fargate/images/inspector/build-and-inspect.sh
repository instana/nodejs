#!/usr/bin/env bash

#######################################
# (c) Copyright IBM Corp. 2023
#######################################

set -xeo pipefail

cd `dirname $BASH_SOURCE`

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

./build-and-push.sh

kubectl -n eks-sample-app delete deployment eks-nodejs-inspector-deployment
kubectl apply -f nodejs-inspector-deployment.yaml

sleep 60

podname=$(kubectl get pods -n eks-sample-app --no-headers -o custom-columns=":metadata.name" | ag nodejs-inspector | tail -n 1)

kubectl exec -it "$podname" -n eks-sample-app -- sh -c "curl http://localhost:3000/ > /usr/src/app/INSPECTOR_OUTPUT.txt"

kubectl cp "eks-sample-app/$podname:/usr/src/app/INSPECTOR_OUTPUT.txt" "INSPECTOR_OUTPUT_$(date +%F_%H-%M-%S).txt"
