import { CancellationToken, CompletionItem, CompletionItemKind, MarkdownString, Position, SnippetString, TextDocument } from "vscode";
import { WorkbenchFileManager } from "./workbenchFileManager";

export interface FieldWithType {
    field: string;
    type: string;
}

//Extremely basic/naive implementation to find extendable entities
//   This should be in language server
export const federationCompletionProvider = {
    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken) {
        let line = document.lineAt(position.line);
        if (line.text) {
            //If not undefined, we're inside a word/something and shouldn't return anything
        }
        else {
            //Add federation items that can be extended
            let splitPath = document.uri.fsPath.split('.graphql')[0].split('/');
            let serviceName = splitPath[splitPath.length - 1];
            let completionItems = new Array<FederationEntityExtensionItem>();
            let extendableTypes = await WorkbenchFileManager.getWorkbenchExtendableTypes();

            for (var sn in extendableTypes)
                if (sn != serviceName)
                    extendableTypes[sn].map(type => completionItems.push(new FederationEntityExtensionItem(type.type, type.keyFields)));

            return completionItems;
        }
    }
}

export class FederationEntityExtensionItem extends CompletionItem {
    constructor(typeToExtend: string, keyFields: FieldWithType[]) {
        super(typeToExtend, CompletionItemKind.Reference);

        let insertSnippet = new SnippetString('extend type ');
        let typeExtensionCodeBlock = `extend type ${typeToExtend} @key(fields:"`;

        insertSnippet.appendVariable("typeToExtend", typeToExtend);
        insertSnippet.appendText('@key(fields:"');

        let keys = '{ '
        for (var i = 0; i < keyFields.length; i++) {
            let keyField = keyFields[i];
            if (i == keyFields.length - 1) {
                keys += `${keyField.field} }`;
                typeExtensionCodeBlock += keyField.field;
                insertSnippet.appendText(keyField.field);
            } else {
                let fieldWithSpace = `${keyField.field} `;
                keys += fieldWithSpace;
                typeExtensionCodeBlock += fieldWithSpace;
                insertSnippet.appendText(fieldWithSpace);
            }
        }

        typeExtensionCodeBlock += `"){\n`;
        insertSnippet.appendText(`"){\n`);

        for (var i = 0; i < keyFields.length; i++) {
            let keyField = keyFields[i];
            let fieldLine = `\t${keyField.field}: ${keyField.type} @external\n`;
            typeExtensionCodeBlock += fieldLine;
            insertSnippet.appendText(fieldLine);
        }

        insertSnippet.appendTabstop(1);
        typeExtensionCodeBlock += '}';
        insertSnippet.appendText(`\n}`);

        let mkdDocs = new MarkdownString();
        mkdDocs.appendCodeblock(typeExtensionCodeBlock, 'graphql');
        mkdDocs.appendMarkdown(`To learn more about extending entities, click [here](https://www.apollographql.com/docs/federation/entities/#extending).`);

        this.documentation = mkdDocs;
        this.detail = `Extend ${typeToExtend} by keys ${keys}`;
        this.insertText = insertSnippet;
    }
}