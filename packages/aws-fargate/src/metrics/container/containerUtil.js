'use strict';

exports.fullyQualifiedContainerId = function fullyQualifiedContainerId(taskArn, containerName) {
  return taskArn + '::' + containerName;
};

exports.convert = function convert(metadata) {
  return {
    dockerId: metadata.DockerId,
    dockerName: metadata.DockerName,
    containerName: metadata.Name,
    image: metadata.Image,
    imageId: metadata.ImageID,
    taskArn: metadata.Labels ? metadata.Labels['com.amazonaws.ecs.task-arn'] : undefined,
    taskDefinition: metadata.Labels ? metadata.Labels['com.amazonaws.ecs.task-definition-family'] : undefined,
    taskDefinitionVersion: metadata.Labels ? metadata.Labels['com.amazonaws.ecs.task-definition-version'] : undefined,
    clusterArn: metadata.Labels ? metadata.Labels['com.amazonaws.ecs.cluster'] : undefined,
    desiredStatus: metadata.DesiredStatus,
    knownStatus: metadata.KnownStatus,
    limits: {
      cpu: metadata.Limits ? metadata.Limits.CPU : undefined,
      memory: metadata.Limits ? metadata.Limits.Memory : undefined
    },
    createdAt: metadata.CreatedAt,
    startedAt: metadata.StartedAt,
    type: metadata.Type
  };
};
