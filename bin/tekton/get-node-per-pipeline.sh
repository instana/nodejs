#!/bin/bash

#######################################
# (c) Copyright IBM Corp. 2025
#######################################

namespaces=$(kubectl get ns --no-headers -o custom-columns=":metadata.name" | grep '^pw-')
for ns in $namespaces; do
  echo "Namespace: $ns"

  pods=$(kubectl get pods -n "$ns" --no-headers -o custom-columns=":metadata.name" | grep '^affinity-assistant-')

  for pod in $pods; do
    node=$(kubectl get pod "$pod" -n "$ns" -o jsonpath="{.spec.nodeName}")
    echo "  Pod: $pod runs on node: $node"
  done
done
