import * as vscode from 'vscode';
import { join, resolve } from "path";
import { gql } from "apollo-server";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { buildFederatedSchema, printSchema } from '@apollo/federation';
import { ApolloWorkbench } from "./extension";

export function getSelectedWorkbenchFile(context: vscode.ExtensionContext) {
    let selectedWbFile = context.workspaceState.get('selectedWbFile');

    return getWorkbenchFile((selectedWbFile as any)?.path);
}
export function saveSelectedWorkbenchFile(wb: ApolloWorkbench, context: vscode.ExtensionContext) {
    let selectedWbFile = context.workspaceState.get('selectedWbFile');
    saveWorkbenchFile(wb, (selectedWbFile as any)?.path);
}

export function getWorkbenchFile(filePath: string): ApolloWorkbench {
    return JSON.parse(readFileSync(filePath, { encoding: "utf8" }));
}
export function saveWorkbenchFile(wb: ApolloWorkbench, path: string) {
    writeFileSync(path, JSON.stringify(wb), { encoding: "utf8" });
}

export function workspaceFolderPath() {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0])
        return vscode.workspace.workspaceFolders[0].uri.fsPath;

    return "";
}

export function workspaceQueriesFolder(autoCreate: Boolean = true) {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) {
        let workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
        let folderPath = `${workspaceFolder}/.workbench-queries`;
        if (!existsSync(folderPath) && autoCreate)
            mkdirSync(folderPath);

        let apolloConfig = `module.exports = { client: { service: { url: "http://localhost:4000" }, includes: ["./.workbench-queries/*.graphql"] } }`;
        writeFileSync(`${workspaceFolder}/apollo.config.js`, JSON.stringify(apolloConfig), { encoding: "utf8" });

        return `${vscode.workspace.workspaceFolders[0].uri.fsPath}/.workbench-schemas`;
    }

    return "";
}

export function workspaceSchemasFolder(autoCreate: Boolean = true) {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) {
        let folderPath = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/.workbench-schemas`;
        if (!existsSync(folderPath) && autoCreate)
            mkdirSync(folderPath);

        return `${vscode.workspace.workspaceFolders[0].uri.fsPath}/.workbench-schemas`;
    }
    return "";
}

export function getPortMapping() {
    return JSON.parse(readFileSync(resolve(workspaceSchemasFolder(), "port-mapping.json"), { encoding: "utf8" }));
}

export function getLocalSchemaFromFile(serviceName) {
    let localSchemaFilePath = resolve(workspaceSchemasFolder(), `${serviceName}.graphql`);
    return readFileSync(localSchemaFilePath, { encoding: "utf8" });
}
export function formatSchemaToString(schemaString) {
    let schema = buildFederatedSchema(gql(schemaString));
    return printSchema(schema);
}


export function writePortMapping(portMapping) {
    writeFileSync(resolve(workspaceSchemasFolder(), "port-mapping.json"), JSON.stringify(portMapping), { encoding: "utf8" });
}

// export function writeServiceSchemaErrors(serviceName, errors) {
//     let errorsString = JSON.stringify(errors);
//     let serviceErorrFileName = `errors-${serviceName}.json`;
//     let serviceErrorFilePath = resolve(generatedSchemasFolder, serviceErorrFileName);
//     if (errorsString && errorsString.length > 0) {
//         console.log(`Error with mocking ${serviceName} schema. See /schemas/${serviceErorrFileName}`);
//         writeFileSync(serviceErrorFilePath, errorsString, { encoding: "utf8" });
//     } else if (existsSync(serviceErrorFilePath))
//         unlinkSync(serviceErrorFilePath);
// }

