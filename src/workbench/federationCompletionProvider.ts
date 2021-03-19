import { CancellationToken, CompletionItem, CompletionItemKind, MarkdownString, Position, SnippetString, TextDocument, window, workspace } from "vscode";
import { getServiceAvailableTypes } from "../graphql/parsers/schemaParser";
import { StateManager } from "./stateManager";
import { getAutocompleteSuggestions } from "@apollographql/graphql-language-service-interface";

export interface FieldWithType {
    field: string;
    type?: string;
}

//Extremely basic/naive implementation to find extendable entities
//   This should be in language server
export const federationCompletionProvider = {
    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken) {
        //Only provide completion items for schemas open in workbench
        let uri = document.uri;
        let completionItems = new Array<CompletionItem>();

        if (uri.scheme == 'workbench' && uri.path.includes('schemas')) {
            let line = document.lineAt(position.line);
            let lineText = line.text;
            let serviceName = document.uri.query;

            if (lineText && serviceName) {
                //If not undefined, we're inside a word/something and shouldn't return anything
                let trimmedText = lineText.trim();
                let character = trimmedText.charAt(trimmedText.length - 1);
                if (character == ':') {
                    let completionTypes = await getServiceAvailableTypes(serviceName);
                    for (var i = 0; i < completionTypes.length; i++) {
                        let typeName = completionTypes[i];
                        let details = '';
                        let documentation = new MarkdownString();
                        let completionKind = CompletionItemKind.Value;

                        if (typeName.includes(':')) {
                            let typeSplit = typeName.split(':');
                            if (typeSplit[0] == 'I') {
                                details = `Interface ${typeSplit[1]}`;
                                completionKind = CompletionItemKind.Interface;
                                documentation.appendText('To learn more about interfaces, click [here](https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/#interface-type).');
                            } else if (typeSplit[0] == 'O') {
                                details = `Object Types ${typeSplit[1]}`;
                                completionKind = CompletionItemKind.Class;
                                documentation.appendText('To learn more about object types, click [here](https://www.apollographql.com/docs/apollo-server/schema/schema/#object-types).');
                            } else if (typeSplit[0] == 'S') {
                                details = `Scalar Types ${typeSplit[1]}`;
                                completionKind = CompletionItemKind.Struct;
                                documentation.appendText('To learn more about object types, click [here](https://www.apollographql.com/docs/apollo-server/schema/scalars-enums/#custom-scalars).');
                            }
                            else if (typeSplit[0] == 'E') {
                                details = `Enum Types ${typeSplit[1]}`;
                                completionKind = CompletionItemKind.Enum;
                                documentation.appendText('To learn more about object types, click [here](https://www.apollographql.com/docs/apollo-server/schema/scalars-enums/#enums).');
                            }


                            typeName = typeSplit[1];
                        } else {
                            documentation.appendText(`To learn more about GraphQL's default scalar types, click [here](https://www.apollographql.com/docs/apollo-server/schema/schema/#scalar-types).`);
                        }

                        let completionItem = new CompletionItem(typeName, completionKind);
                        completionItem.insertText = typeName;
                        completionItem.detail = details;
                        completionItem.documentation = documentation;
                        completionItems.push(completionItem);
                    }
                }
            }
            else {
                //Add federation items that can be extended

                let extendableTypes = StateManager.instance.workspaceState_selectedWorkbenchAvailableEntities;
                // await extractDefinedEntitiesByService();

                for (var sn in extendableTypes)
                    if (sn != serviceName)
                        extendableTypes[sn].map(({ type, keys }) => {
                            Object.keys(keys).forEach(key => {
                                completionItems.push(new FederationEntityExtensionItem(key, type, keys[key], sn))
                            })
                        });

                //Add default items for creating new entity/type/interface
                completionItems.push(new ObjectTypeCompletionItem());
                completionItems.push(new InterfaceCompletionItem());
                completionItems.push(new EntityObjectTypeCompletionItem());
            }
        }
        else if (uri.scheme == 'workbench' && uri.path.includes('/queries/')) {
            let schema = StateManager.instance.workspaceState_schema;
            if (schema) {
                let query = document.getText();
                let suggestions = getAutocompleteSuggestions(schema, query, position);
                if (suggestions.length > 0) {
                    suggestions.forEach(ci => completionItems.push(new QueryCompletionItem(ci)));
                }
            } else {
                completionItems.push(new NoValidSchema());
            }
        }

        if (completionItems.length > 0) return completionItems;
    }
}

class NoValidSchema extends CompletionItem {
    constructor() {
        super("No composed schema in workbench", CompletionItemKind.Constant);
        this.insertText = "";
    }
}

export class QueryCompletionItem extends CompletionItem {
    constructor(ci: any) {
        super(ci.label, CompletionItemKind.Constant);
        this.detail = ci.detail;
        this.insertText = ci.label;
        this.documentation = ci.documentation
    }
}

export class EntityObjectTypeCompletionItem extends CompletionItem {
    constructor() {
        super('Entity Object type', CompletionItemKind.Snippet);
        this.sortText = 'b';

        let comments = `"""\nThis is an Entity, docs:https://www.apollographql.com/docs/federation/entities/\nYou will need to define a __resolveReference resolver for the type you define, docs: https://www.apollographql.com/docs/federation/entities/#resolving\n"""`;
        let insertSnippet = new SnippetString(`${comments}\ntype `);
        insertSnippet.appendTabstop(1);
        insertSnippet.appendText(` @key(fields:"id") {\n\tid:ID!\n}`);

        this.detail = "Define a new Entity Object Type";
        this.insertText = insertSnippet;
        this.documentation = new MarkdownString(`To learn more about entities, click [here](https://www.apollographql.com/docs/federation/entities/).`);
    }
}

export class ObjectTypeCompletionItem extends CompletionItem {
    constructor() {
        super('Object type', CompletionItemKind.Snippet);
        this.sortText = 'b';

        let insertSnippet = new SnippetString('"""\nHere are some helpful details about your type\n"""\ntype ');
        insertSnippet.appendTabstop(1);
        insertSnippet.appendText(` {\n\n}`);

        this.detail = "Define a new Object Type";
        this.insertText = insertSnippet;
        this.documentation = new MarkdownString(`To learn more about Object Types, click [here](https://www.apollographql.com/docs/apollo-server/schema/schema/#object-types).`);
    }
}

export class InterfaceCompletionItem extends CompletionItem {
    constructor() {
        super('Interface', CompletionItemKind.Snippet);
        this.sortText = 'b';

        let insertSnippet = new SnippetString('interface ');
        insertSnippet.appendTabstop(1);
        insertSnippet.appendText(` {\nHere are some helpful details about your interface\n}`);

        this.detail = "Define a new Interface";
        this.insertText = insertSnippet;
        this.documentation = new MarkdownString(`To learn more about interfaces, click [here](https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/#interface-type).`);
    }
}

export class FederationEntityExtensionItem extends CompletionItem {
    constructor(key: string, typeToExtend: string, keyFields: FieldWithType[], owningServiceName: string) {
        super(`extend ${typeToExtend} by "${key}"`, CompletionItemKind.Reference);
        this.sortText = 'a';

        let insertSnippet = new SnippetString(`extend type `);
        let typeExtensionCodeBlock = `extend type ${typeToExtend} @key(fields:"${key}") {\n`;

        insertSnippet.appendVariable("typeToExtend", typeToExtend);
        insertSnippet.appendText(' @key(fields:"');
        insertSnippet.appendVariable("key", key);
        insertSnippet.appendText('") {\n');

        for (var i = 0; i < keyFields.length; i++) {
            let keyField = keyFields[i];
            let fieldLine = `\t${keyField.field}: ${keyField.type} @external\n`;
            typeExtensionCodeBlock += fieldLine;
            insertSnippet.appendText(fieldLine);
        }

        insertSnippet.appendText(`\t`);
        insertSnippet.appendTabstop(1);
        typeExtensionCodeBlock += '}';
        insertSnippet.appendText(`\n}`);

        let mkdDocs = new MarkdownString();
        mkdDocs.appendCodeblock(typeExtensionCodeBlock, 'graphql');
        mkdDocs.appendText(`Owning Service: ${owningServiceName}\n`);
        mkdDocs.appendMarkdown(`To learn more about extending entities, click [here](https://www.apollographql.com/docs/federation/entities/#extending).`);

        this.documentation = mkdDocs;
        this.detail = `Extend entity ${typeToExtend}`;
        this.insertText = insertSnippet;
    }
}