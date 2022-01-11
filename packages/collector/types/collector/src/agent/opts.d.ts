export var requestTimeout: number;
export var host: string;
export var port: number;
export var autoProfile: string | boolean;
export function init(config: import('../util/normalizeConfig').CollectorConfig): void;
export { agentHost as host, agentPort as port, undefined as agentUuid };
