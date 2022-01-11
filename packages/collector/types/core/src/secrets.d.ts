export var matchers: SecretMatchers;
export var isSecret: (key: string) => boolean;
export function init(config: SecretOption): void;
export function setMatcher(matcherId: MatchingOptions, secretsList: Array<any>): void;
export type SecretMatchers = {
    "equals-ignore-case": (secrets: Array<string>) => (key: string) => boolean;
    equals: (secrets: Array<string>) => (key: string) => boolean;
    "contains-ignore-case": (secrets: Array<string>) => (key: string) => boolean;
    contains: (secrets: Array<string>) => (key: string) => boolean;
    regex: (secrets: Array<string>) => (key: string) => boolean;
    none: () => () => boolean;
};
export type MatchingOptions = 'contains' | 'equals-ignore-case' | 'equals' | 'contains-ignore-case' | 'regex';
export type Secrets = {
    keywords: any;
    matcherMode: MatchingOptions;
};
export type SecretOption = {
    secrets: Secrets;
};
