import { outputChannel } from "../extension";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../../package.json');

export function log(str: string) {
    outputChannel.appendLine(`${str}`);
}

//Redirect log to Output tab in extension
// console.log = function (str: string) {

//     if (str.includes('apollo-workbench:')) {
//         outputChannel.appendLine(str);
//     } else if (str.includes('Checking for composition updates')) {
//     } else if (str.includes('No change in service definitions since last check')) {
//     } else if (str.includes('Schema loaded and ready for execution')) {
//         outputChannel.appendLine(`${name}:${str}`);
//     } else {
//         const strings = str.split('\n');
//         strings.forEach(s => outputChannel.appendLine(`\t${s}`));
//     }
// };
