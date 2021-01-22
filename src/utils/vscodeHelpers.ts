import { Uri, window, workspace } from "vscode";
import { getUserMemberships, isValidKey } from "../studio-gql/graphClient";
import { StateManager } from "../workbench/stateManager";
import { WorkbenchUri, FileProvider } from "./files/fileProvider";
import { createTypescriptTemplate } from "./export-project/createTypescriptTemplate";
import { createJavascriptTemplate } from "./export-project/createJavascriptTemplate";

export async function exportWorkbenchProject(pathToWorkbench: string) {
    let workbenchFile = FileProvider.instance.workbenchFiles.get(pathToWorkbench);
    if (workbenchFile) {

        let exportLanguage = await window.showQuickPick(["Javascript", "Typescript"], { canPickMany: false, placeHolder: "Would you like to use Javascript or Typescript for the exported project?" });
        if (exportLanguage == "Typescript") {
            createTypescriptTemplate(workbenchFile);
        } else {
            createJavascriptTemplate(workbenchFile);
        }
    }
}

export async function getLineText(serviceName: string, lineAt: number = 0): Promise<string> {
    // let doc = await workspace.openTextDocument(WorkbenchUri.parse(serviceName));
    // if (doc)
    //     return doc.lineAt(lineAt).text;

    return "";
}

export async function getLastLineOfText(serviceName: string) {
    let doc = await workspace.openTextDocument(WorkbenchUri.parse(serviceName));
    let docLine = doc.lineAt(doc.lineCount - 1);

    return docLine;
}

export async function enterApiKey() {
    let apiKey = await window.showInputBox({ placeHolder: "Enter User API Key - user:gh.michael-watson:023jr324tj....", })
    if (apiKey && await isValidKey(apiKey)) {
        StateManager.instance.globalState_userApiKey = apiKey;
    } else if (apiKey) {
        window.showErrorMessage("Invalid API key entered");
    } else if (apiKey == '') {
        window.setStatusBarMessage("Login cancelled, no API key entered", 2000);
    }
}

export async function setAccountId() {
    if (!StateManager.instance.globalState_userApiKey)
        await enterApiKey();

    let accountId = '';
    let apiKey = StateManager.instance.globalState_userApiKey;

    if (apiKey) {
        const myAccountIds = await getUserMemberships(apiKey);
        const memberships = (myAccountIds?.me as any)?.memberships;
        if (memberships?.length > 1) {
            let accountMapping: { [key: string]: string } = {};
            memberships.map(membership => {
                let accountId = membership.account.id;
                let accountName = membership.account.name;
                accountMapping[accountName] = accountId;
            });

            let selectedOrgName = await window.showQuickPick(Object.keys(accountMapping), { placeHolder: "Select an account to load graphs from" }) ?? "";
            accountId = accountMapping[selectedOrgName];

        } else {
            accountId = memberships[0]?.account?.id ?? "";
        }

        if (accountId) {
            StateManager.instance.setSelectedGraph("");
            StateManager.instance.globalState_selectedApolloAccount = accountId;
        }
    }
}