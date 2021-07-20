import {
  CancellationToken,
  CompletionItem,
  CompletionItemKind,
  MarkdownString,
  Position,
  SnippetString,
  TextDocument,
  window,
  workspace,
} from 'vscode';
import { getServiceAvailableTypes } from '../graphql/parsers/schemaParser';
import { StateManager } from './stateManager';
import { getAutocompleteSuggestions } from '@apollographql/graphql-language-service-interface';

export interface FieldWithType {
  field: string;
  type?: string;
}

//Extremely basic/naive implementation to find extendable entities
//   This should be in language server
export const federationCompletionProvider = {
  async provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
  ) {
    //Only provide completion items for schemas open in workbench
    const uri = document.uri;
    const completionItems = new Array<CompletionItem>();

    if (uri.scheme == 'workbench' && uri.path.includes('/subgraphs')) {
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const serviceName = document.uri.query;

      if (lineText && serviceName) {
        //If not undefined, we're inside a word/something and shouldn't return anything
        const trimmedText = lineText.trim();
        const character = trimmedText.charAt(trimmedText.length - 1);
        if (character == ':') {
          const completionTypes = await getServiceAvailableTypes(
            serviceName,
            uri.path.split('/subgraphs')[0],
          );
          for (let i = 0; i < completionTypes.length; i++) {
            let typeName = completionTypes[i];
            let details = '';
            const documentation = new MarkdownString();
            let completionKind = CompletionItemKind.Value;

            if (typeName.includes(':')) {
              const isArray = typeName.includes('[');
              const typeSplit = typeName.split(':');
              const typeToAdd = isArray ? "[" + typeSplit[1] : typeSplit[1];
              const completionKindClassifier = isArray ? typeSplit[0].substring(1) : typeSplit[0];
              if (completionKindClassifier == 'I') {
                details = `Interface ${typeToAdd}`;
                completionKind = CompletionItemKind.Interface;
                documentation.appendText(
                  'To learn more about interfaces, click [here](https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/#interface-type).',
                );
              } else if (completionKindClassifier == 'O') {
                details = `Object Types ${typeToAdd}`;
                completionKind = CompletionItemKind.Class;
                documentation.appendText(
                  'To learn more about object types, click [here](https://www.apollographql.com/docs/apollo-server/schema/schema/#object-types).',
                );
              } else if (completionKindClassifier == 'S') {
                details = `Scalar Types ${typeToAdd}`;
                completionKind = CompletionItemKind.Struct;
                documentation.appendText(
                  'To learn more about object types, click [here](https://www.apollographql.com/docs/apollo-server/schema/scalars-enums/#custom-scalars).',
                );
              } else if (completionKindClassifier == 'E') {
                details = `Enum Types ${typeToAdd}`;
                completionKind = CompletionItemKind.Enum;
                documentation.appendText(
                  'To learn more about object types, click [here](https://www.apollographql.com/docs/apollo-server/schema/scalars-enums/#enums).',
                );
              }

              typeName = typeToAdd;
            } else {
              documentation.appendText(
                `To learn more about GraphQL's default scalar types, click [here](https://www.apollographql.com/docs/apollo-server/schema/schema/#scalar-types).`,
              );
            }

            const completionItem = new CompletionItem(typeName, completionKind);
            completionItem.insertText = typeName;
            completionItem.detail = details;
            completionItem.documentation = documentation;
            completionItems.push(completionItem);
          }
        }
      } else {
        //Add federation items that can be extended

        const extendableTypes =
          StateManager.instance
            .workspaceState_selectedWorkbenchAvailableEntities;

        for (const sn in extendableTypes)
          if (sn != serviceName)
            extendableTypes[sn].map(({ type, keys }) => {
              Object.keys(keys).forEach((key) => {
                completionItems.push(
                  new FederationEntityExtensionItem(key, type, keys[key], sn),
                );
              });
            });

        //Add default items for creating new entity/type/interface
        completionItems.push(new ObjectTypeCompletionItem());
        completionItems.push(new InterfaceCompletionItem());
        completionItems.push(new EntityObjectTypeCompletionItem());
      }
    } else if (uri.scheme == 'workbench' && uri.path.includes('/queries/')) {
      const schema = StateManager.instance.workspaceState_schema;
      if (schema) {
        const query = document.getText();
        const suggestions = getAutocompleteSuggestions(schema, query, position);
        if (suggestions.length > 0) {
          suggestions.forEach((ci) =>
            completionItems.push(new QueryCompletionItem(ci)),
          );
        }
      } else {
        completionItems.push(new NoValidSchema());
      }
    }

    if (completionItems.length > 0) return completionItems;
  },
};

class NoValidSchema extends CompletionItem {
  constructor() {
    super('No composed schema in workbench', CompletionItemKind.Constant);
    this.insertText = '';
  }
}

export class QueryCompletionItem extends CompletionItem {
  constructor(ci: any) {
    super(ci.label, CompletionItemKind.Constant);
    this.detail = ci.detail;
    this.insertText = ci.label;
    this.documentation = ci.documentation;
  }
}

export class EntityObjectTypeCompletionItem extends CompletionItem {
  constructor() {
    super('Entity Object type', CompletionItemKind.Snippet);
    this.sortText = 'b';

    const comments = `"""\nThis is an Entity, docs:https://www.apollographql.com/docs/federation/entities/\nYou will need to define a __resolveReference resolver for the type you define, docs: https://www.apollographql.com/docs/federation/entities/#resolving\n"""`;
    const insertSnippet = new SnippetString(`${comments}\ntype `);
    insertSnippet.appendTabstop(1);
    insertSnippet.appendText(` @key(fields:"id") {\n\tid:ID!\n}`);

    this.detail = 'Define a new Entity Object Type';
    this.insertText = insertSnippet;
    this.documentation = new MarkdownString(
      `To learn more about entities, click [here](https://www.apollographql.com/docs/federation/entities/).`,
    );
  }
}

export class ObjectTypeCompletionItem extends CompletionItem {
  constructor() {
    super('Object type', CompletionItemKind.Snippet);
    this.sortText = 'b';

    const insertSnippet = new SnippetString(
      '"""\nHere are some helpful details about your type\n"""\ntype ',
    );
    insertSnippet.appendTabstop(1);
    insertSnippet.appendText(` {\n\n}`);

    this.detail = 'Define a new Object Type';
    this.insertText = insertSnippet;
    this.documentation = new MarkdownString(
      `To learn more about Object Types, click [here](https://www.apollographql.com/docs/apollo-server/schema/schema/#object-types).`,
    );
  }
}

export class InterfaceCompletionItem extends CompletionItem {
  constructor() {
    super('Interface', CompletionItemKind.Snippet);
    this.sortText = 'b';

    const insertSnippet = new SnippetString('interface ');
    insertSnippet.appendTabstop(1);
    insertSnippet.appendText(
      ` {\nHere are some helpful details about your interface\n}`,
    );

    this.detail = 'Define a new Interface';
    this.insertText = insertSnippet;
    this.documentation = new MarkdownString(
      `To learn more about interfaces, click [here](https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/#interface-type).`,
    );
  }
}

export class FederationEntityExtensionItem extends CompletionItem {
  constructor(
    key: string,
    typeToExtend: string,
    keyFields: FieldWithType[],
    owningServiceName: string,
  ) {
    super(`extend ${typeToExtend} by "${key}"`, CompletionItemKind.Reference);
    this.sortText = 'a';

    const insertSnippet = new SnippetString(`extend type `);
    let typeExtensionCodeBlock = `extend type ${typeToExtend} @key(fields:"${key}") {\n`;

    insertSnippet.appendVariable('typeToExtend', typeToExtend);
    insertSnippet.appendText(' @key(fields:"');
    insertSnippet.appendVariable('key', key);
    insertSnippet.appendText('") {\n');

    for (let i = 0; i < keyFields.length; i++) {
      const keyField = keyFields[i];
      const fieldLine = `\t${keyField.field}: ${keyField.type} @external\n`;
      typeExtensionCodeBlock += fieldLine;
      insertSnippet.appendText(fieldLine);
    }

    insertSnippet.appendText(`\t`);
    insertSnippet.appendTabstop(1);
    typeExtensionCodeBlock += '}';
    insertSnippet.appendText(`\n}`);

    const mkdDocs = new MarkdownString();
    mkdDocs.appendCodeblock(typeExtensionCodeBlock, 'graphql');
    mkdDocs.appendText(`Owning Service: ${owningServiceName}\n`);
    mkdDocs.appendMarkdown(
      `To learn more about extending entities, click [here](https://www.apollographql.com/docs/federation/entities/#extending).`,
    );

    this.documentation = mkdDocs;
    this.detail = `Extend entity ${typeToExtend}`;
    this.insertText = insertSnippet;
  }
}
