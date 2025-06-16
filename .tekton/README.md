# Tekton

## Private Workers

- Single Zone
- Strong hardware
- > 6 workers (= 6 pipelines in parallel)

## Restrictions

- Slashes in branch names is not allowed.

## Affinity Assistant Configuration

You have to manually apply this to our cluster to force Tekton
to choose a worker based on these conditions. The goal should be
that one pipeline runs on one worker at a time. The pipelines are really heavy.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: config-artifact-pvc
  namespace: tekton-pipelines
data:
  affinityAssistant.podTemplate: |
    affinity:
      podAntiAffinity:
        requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
                - key: app
                  operator: In
                  values:
                    - affinity-assistant
            topologyKey: "kubernetes.io/hostname"
    resources:
      requests:
        cpu: "25"
        memory: "100Gi"
```        

```sh
..login...
ibmcloud ks cluster config --cluster mycluster-eu-de-1-bx2.2x8
kubectl get namespaces
kubectl apply -f affinity.yaml
```

## Linting

```sh
npm run tekton:lint
```

## Local Testing

Follow the instructions provided in the [Tekton Dashboard tutorial](https://github.com/tektoncd/dashboard/blob/97700646be7728e36f01120131da8620ee69122f/docs/tutorial.md#prerequisites).

## Generate Files

To generate/update the required Tekton pipeline files, run the following commands:

```
cd .tekton
node generate-default-pipeline.js
node generate-test-files.js
```

## Migrate to a New Cluster

- You will need to add subpaths for the Tekton files under **Settings** > **Definitions**:
  - `main .tekton/listeners`
  - `main .tekton/tasks`
  - `main .tekton/pipeline`
  - `main .tekton/tasks/test-groups`

## Troubleshooting

> QPS Limit exceeded

`registryPullQPS` is default 5 in the IBMCloud and you cannot configure it.
We are using `imagePullPolicy: IfNotPresent` to not pull the image
if it already exists. You jsut to rerun the build to not run into the problem.
As soon as the Node worker has enough images cached, the error disappears.