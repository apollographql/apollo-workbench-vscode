import * as vscode from 'vscode';
import { join, resolve } from "path";
import { gql } from "apollo-server";
import { writeFileSync, existsSync, readFileSync, mkdirSync, accessSync } from "fs";
import { buildFederatedSchema, printSchema } from '@apollo/federation';
import { ApolloWorkbench } from "./extension";

export function getQueryFile(queryName) {
    const queryFilePath = resolve(workspaceQueriesFolderPath(), `${queryName}.graphql`);

    return readFileSync(queryFilePath, { encoding: "utf8" });
}

export function getSelectedWorkbenchFile(context?: vscode.ExtensionContext) {
    let selectedWbFile = context?.workspaceState.get('selectedWbFile');

    if (pathExists((selectedWbFile as any)?.path) && selectedWbFile != '')
        return getWorkbenchFile((selectedWbFile as any)?.path);
    else {
        context?.workspaceState.update('selectedWbFile', '');
        return undefined;
    }
}
export function saveSelectedWorkbenchFile(wb: ApolloWorkbench, context?: vscode.ExtensionContext) {
    let selectedWbFile = context?.workspaceState.get('selectedWbFile');
    if (selectedWbFile)
        saveWorkbenchFile(wb, (selectedWbFile as any)?.path);
}

export function getWorkbenchFile(filePath: string): ApolloWorkbench {
    return JSON.parse(readFileSync(filePath, { encoding: "utf8" }));
}
export function saveWorkbenchFile(wb: ApolloWorkbench, path?: string) {
    if (!path && vscode.workspace.workspaceFolders) path = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/${wb.graphName}.apollo-workbench`;
    if (path)
        writeFileSync(path, JSON.stringify(wb), { encoding: "utf8" });
    else
        vscode.window.showErrorMessage(`Path was undefined when trying to create workbench file: ${wb.graphName}.apollo-workbench`)
}

export function workspaceFolderPath() {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0])
        return vscode.workspace.workspaceFolders[0].uri.fsPath;

    return "";
}

function workspaceFolder() {
    if (vscode.workspace?.workspaceFolders) {
        let workbenchFolderPath = `${vscode.workspace?.workspaceFolders[0]?.uri?.fsPath}/.workbench`;

        if (!existsSync(workbenchFolderPath))
            mkdirSync(workbenchFolderPath);

        return workbenchFolderPath;
    }
    return undefined;
}

export function workspaceQueriesFolderPath(autoCreate: Boolean = true) {
    let workspace = workspaceFolder();
    if (workspace) {
        let folderPath = `${workspace}/queries`;
        if (!existsSync(folderPath) && autoCreate)
            mkdirSync(folderPath);

        if (!existsSync(`${workspace}/apollo.config.js`)) {
            let apolloConfig = `module.exports = { client: { service: { url: "http://localhost:4000" }, includes: ["./.workbench/queries/*.graphql"] } }`;
            writeFileSync(`${workspace}/apollo.config.js`, apolloConfig, { encoding: "utf8" });
        }

        return folderPath;
    }

    return "";
}

export function workspaceSchemasFolderPath(autoCreate: Boolean = true) {
    let workspace = workspaceFolder();
    if (workspace) {
        let folderPath = `${workspace}/schemas`;
        if (!existsSync(folderPath) && autoCreate)
            mkdirSync(folderPath);

        return folderPath;
    }
    return "";
}

export function getPortMapping() {
    return JSON.parse(readFileSync(resolve(workspaceSchemasFolderPath(), "port-mapping.json"), { encoding: "utf8" }));
}

export function getLocalSchemaFromFile(serviceName) {
    let localSchemaFilePath = resolve(workspaceSchemasFolderPath(), `${serviceName}.graphql`);
    return readFileSync(localSchemaFilePath, { encoding: "utf8" });
}
export function writeLocalSchemaToFile(serviceName: string, sdl: string) {
    writeFileSync(resolve(workspaceSchemasFolderPath(), `${serviceName}.graphql`), sdl, { encoding: "utf8" });
}
export function formatSchemaToString(schemaString) {
    let schema = buildFederatedSchema(gql(schemaString));
    return printSchema(schema);
}


export function writePortMapping(portMapping) {
    writeFileSync(resolve(workspaceSchemasFolderPath(), "port-mapping.json"), JSON.stringify(portMapping), { encoding: "utf8" });
}

export function pathExists(p: string): boolean {
    try {
        accessSync(p);
    } catch (err) {
        return false;
    }
    return true;
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

