/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// TODO: this is not clean we need to investigate and improve this later
function getMetricTypeMappings() {
  return {
    sum(value, timestampMs) {
      const timeUnixNano = String(timestampMs * 1000000);

      return {
        // TODO: use semconv
        aggregationTemporality: 1,
        isMonotonic: true,
        dataPoints: [
          {
            asDouble: Number(value) || 0,
            startTimeUnixNano: timeUnixNano,
            timeUnixNano
          }
        ]
      };
    },

    gauge(value, timestampMs) {
      const timeUnixNano = String(timestampMs * 1000000);

      return {
        dataPoints: [
          {
            asDouble: Number(value) || 0,
            timeUnixNano
          }
        ]
      };
    },

    histogram(value, timestampMs) {
      const timeUnixNano = String(timestampMs * 1000000);

      return {
        aggregationTemporality: 1,
        dataPoints: [
          {
            count: 1,
            sum: Number(value) || 0,
            startTimeUnixNano: timeUnixNano,
            timeUnixNano
          }
        ]
      };
    }
  };
}

module.exports = {
  getMetricTypeMappings
};
