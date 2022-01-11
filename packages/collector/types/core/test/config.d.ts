export function getAppStdio(): (string | (NodeJS.WriteStream & {
    fd: 1;
}) | (NodeJS.WriteStream & {
    fd: 2;
}) | (NodeJS.ReadStream & {
    fd: 0;
}))[];
export function getTestTimeout(): 5000 | 30000;
