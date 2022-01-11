export namespace AgentEventSeverity {
    const SLI_EVENT: number;
    const INFO: number;
    const CHANGE: number;
    const WARNING: number;
    const CRITICAL: number;
}
export function announceNodeCollector(cb: (err: Error, rawResponse?: string) => void): void;
export function checkWhetherAgentIsReadyToAcceptData(cb: (ready: boolean) => void): void;
export function sendMetrics(data: {
    [x: string]: any;
}, cb: (...args: any) => any): void;
export function sendSpans(spans: Array<InstanaBaseSpan>, cb: (...args: any) => any): void;
export function sendProfiles(profiles: any, cb: (...args: any) => any): void;
export function sendEvent(eventData: AgentConnectionEvent, cb: (...args: any) => any): void;
export function sendAgentMonitoringEvent(code: string, category: string, cb: (...args: any) => any): void;
export function sendAgentResponseToAgent(messageId: string, response: any, cb: (...args: any) => any): void;
export function sendTracingMetricsToAgent(tracingMetrics: any, cb: (...args: any) => any): void;
export function reportUncaughtExceptionToAgentSync(eventData: any, spans: Array<InstanaBaseSpan>): void;
export function isConnected(): boolean;
export type InstanaBaseSpan = any;
/**
 * Options: SLI_EVENT (-4, deprecated), INFO (-2), CHANGE (-1), WARNING (5), CRITICAL (10)
 */
export type ProblemSeverity = -4 | -2 | -1 | 5 | 10 | number;
export type AgentConnectionEvent = {
    title?: string;
    text?: string;
    plugin?: string;
    pid?: number;
    id?: number;
    code?: string;
    category?: string;
    timestamp?: number;
    duration?: number;
    severity?: ProblemSeverity;
};
export type AgentConnectionPayload = {
    pid: number;
    inode?: string;
    fd?: string;
    pidFromParentNS: boolean;
    spacer: string;
    name?: string;
    args?: string | Array<any>;
    cpuSetFileContent?: string;
};
