import { workspace } from "vscode";
import { WorkbenchUri } from "./files/fileProvider";

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