export function handleRequests(requests: Array<AnnounceRequest>): void;
export function activate(): void;
export function deactivate(): void;
export type AnnounceRequest = {
    action: string;
    messageId: string;
    args: {
        file: string;
    };
};
export type AgentAction = (request: AnnounceRequest, multiCb: (data: {
    [x: string]: any;
}) => void) => void;
