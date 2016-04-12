# Changelog

## Unreleased
 - Increase log level for failed agent communication to warn.

## 1.5.0
 - Track Node.js internal handle and request counts.
 - Report application start time to calculate uptime.

## 1.4.0
 - Support Docker bridge networks by attempting agent communication with the container's default gateway.
 - Support custom agent HTTP ports and name.

## 1.3.3
 - Improve announce cycle stability.

## 1.3.2
 - Use a more efficient data structure for heap space data.

## 1.3.1
 - `v8` module does not exist in early Node.js versions.

## 1.3.0
 - Retrieve heap space statistics.

## 1.2.0
 - Support varying log levels and output destinations.

## 1.1.2
 - Requests may hang and put sensor in endless announce cycle.

## 1.1.1
 - Identification of `event-loop-stats` availability always fails.

## 1.1.0
 - Allow sensor execution without native addons.

## 1.0.0
 - Initial release
