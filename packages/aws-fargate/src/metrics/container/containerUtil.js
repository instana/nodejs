'use strict';

exports.fullyQualifiedContainerId = function fullyQualifiedContainerId(taskArn, containerName) {
  return taskArn + '::' + containerName;
};

exports.dataForSecondaryContainer = function dataForSecondaryContainer(all, dockerId) {
  let dataForThisContainer = all && all.Containers && all.Containers.find(container => container.DockerId === dockerId);
  return dataForThisContainer || {};
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
    ports: metadata.Ports,
    limits: {
      cpu: metadata.Limits ? metadata.Limits.CPU : undefined,
      memory: metadata.Limits ? metadata.Limits.Memory : undefined
    },
    createdAt: metadata.CreatedAt,
    startedAt: metadata.StartedAt,
    type: metadata.Type
  };
};
