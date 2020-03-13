'use strict';

exports.convert = function convert(metadata) {
  return {
    Id: metadata.DockerId,
    Created: metadata.CreatedAt,
    Started: metadata.StartedAt,
    Image: metadata.Image,
    Labels: metadata.Labels,
    NetworkMode:
      metadata.Networks && Array.isArray(metadata.Networks) && metadata.Networks.length > 0
        ? metadata.Networks[0].NetworkMode
        : undefined,
    memory: {
      limit: metadata.Limits.Memory
    }
  };
};
