export function start(): void;
export type AnnounceCycleContext = {
    transitionTo: (newStateName: string) => void;
};
export type AgentState = {
    enter: (ctx: AnnounceCycleContext) => void;
    leave: (ctx?: AnnounceCycleContext) => void;
};
