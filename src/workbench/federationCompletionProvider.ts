// import { getAutocompleteSuggestions } from '../graphql/getAutocompleteSuggestions';
import {
  CancellationToken,
  CompletionItem,
  CompletionItemKind,
  MarkdownString,
  SnippetString,
  TextDocument,
} from 'vscode';
import { Position } from 'vscode-languageserver';
// import { getServiceAvailableTypes } from '../graphql/parsers/schemaParser';
import { StateManager } from './stateManager';
import { FileProvider } from './file-system/fileProvider';
import gql from 'graphql-tag';
import {
  buildSchema,
  EnumValueNode,
  StringValueNode,
  TypeInfo,
  visit,
  visitWithTypeInfo,
} from 'graphql';

export interface FieldWithType {
  field: string;
  type?: string;
}

export type Entity = {
  type: string;
  keyString: string;
  fields: FieldWithType[];
};
function getFieldType(field: any) {
  switch (field.kind) {
    case 'ObjectTypeDefinition':
    case 'FieldDefinition':
    case 'ListType':
      return getFieldType(field.type);
    case 'NamedType':
      return field.name.value;
    case 'NonNullType':
      switch (field.type.kind) {
        case 'ListType':
          return getFieldType(field.type);
        case 'NamedType':
          return field.type.name.value;
      }
      return '';
    default:
      return '';
  }
}
export function extractEntities(supergraphSdl: string) {
  const entities: { [subgraphName: string]: Entity[] } = {};
  const typeInfo = new TypeInfo(buildSchema(supergraphSdl));
  const doc = gql(supergraphSdl);
  const enumSubgraphValues = {};
  visit(
    doc,
    visitWithTypeInfo(typeInfo, {
      ObjectTypeDefinition(node) {
        const currentNode = node;
        node.directives?.forEach((d) => {
          if (d.name.value == 'join__type') {
            const graphArg = d.arguments?.find((a) => a.name.value == 'graph');
            const keysArg = d.arguments?.find((a) => a.name.value == 'key');
            if (graphArg && keysArg) {
              const subgraphName =
                enumSubgraphValues[(graphArg.value as EnumValueNode).value];
              if (!entities[subgraphName]) entities[subgraphName] = [];
              const keyString = (keysArg.value as StringValueNode).value;
              const keys = keyString.split(' ');

              if (keys.length == 1) {
                const keyField = currentNode.fields?.find(
                  (f) => f.name.value == keys[0],
                );
                if (keyField) {
                  console.log(keyField);
                  entities[subgraphName].push({
                    type: currentNode.name.value,
                    keyString,
                    fields: [{ field: keys[0], type: getFieldType(keyField) }],
                  });
                }
              } else {
                //multiple keys entity
                const fields: FieldWithType[] = [];
                keys.forEach((key) => {
                  const keyField = currentNode.fields?.find(
                    (f) => f.name.value == key,
                  );
                  if (keyField) {
                    console.log(keyField);
                    fields.push({ field: key, type: getFieldType(keyField) });
                  }
                });

                entities[subgraphName].push({
                  type: currentNode.name.value,
                  keyString,
                  fields,
                });
              }
            }
          }
        });
      },
      EnumTypeDefinition(node) {
        if (node.name.value == 'join__Graph') {
          node.values?.forEach((v) => {
            if (v?.directives && v?.directives[0]) {
              const subgraph = (
                v?.directives[0].arguments?.find((a) => a.name.value == 'name')
                  ?.value as StringValueNode
              )?.value;
              if (subgraph) enumSubgraphValues[v.name.value] = subgraph;
            }
          });
        }
      },
    }),
  );

  return entities;
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
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const addedEntities: string[] = [];

    const { path: wbFilePath, subgraphName: originatingSubgraph } =
      FileProvider.instance.workbenchFilePathBySchemaFilePath(uri.fsPath);
    if (!lineText) {
      const extendableTypes =
        StateManager.instance.workspaceState_availableEntities;

      if (extendableTypes[wbFilePath]) {
        const originatingSubgraphEntities =
          extendableTypes[wbFilePath][originatingSubgraph];
        Object.keys(extendableTypes[wbFilePath]).forEach((subgraphName) => {
          const subgraphEntities = extendableTypes[wbFilePath][subgraphName];
          if (originatingSubgraph != subgraphName) {
            const subgraphEntities = extendableTypes[wbFilePath][subgraphName];
            if (subgraphEntities) {
              subgraphEntities.forEach((entity) => {
                //Need to check if entity is already in originatingSubgraph
                if (
                  originatingSubgraphEntities?.find(
                    (e) =>
                      e.type == entity.type && e.keyString == entity.keyString,
                  )
                )
                  return;
                const uniqueKey = `${entity.type}:${entity.keyString}`;
                if (!addedEntities.includes(uniqueKey)) {
                  if (
                    extendableTypes[wbFilePath][originatingSubgraph]?.findIndex(
                      (e) =>
                        e.type == entity.type &&
                        e.keyString == entity.keyString,
                    ) ??
                    -1 < 0
                  ) {
                    addedEntities.push(uniqueKey);

                    completionItems.push(
                      new FederationEntityExtensionItem(
                        entity.keyString,
                        entity.type,
                        entity.fields,
                      ),
                    );
                  }
                }
              });
            }
          }
        });
      }

      completionItems.push(new EntityObjectTypeCompletionItem());
    }

    if (completionItems.length > 0) return completionItems;
  },
};

export class EntityObjectTypeCompletionItem extends CompletionItem {
  constructor() {
    super('Entity Object type', CompletionItemKind.Snippet);
    this.sortText = 'b';

    const insertSnippet = new SnippetString(`type `);
    insertSnippet.appendTabstop(1);
    insertSnippet.appendText(` @key(fields:"`);
    insertSnippet.appendTabstop(2);
    insertSnippet.appendText(`") {\n\t`);
    insertSnippet.appendTabstop(3);
    insertSnippet.appendText(`\n}`);

    this.detail = 'Define a new Entity Object Type';
    this.insertText = insertSnippet;
    this.documentation = new MarkdownString(
      `To learn more about entities, click [here](https://www.apollographql.com/docs/federation/entities/).`,
    );
  }
}

export class FederationEntityExtensionItem extends CompletionItem {
  constructor(key: string, typeToUse: string, keyFields: FieldWithType[]) {
    super(`${typeToUse} by "${key}"`, CompletionItemKind.Reference);
    this.sortText = `${typeToUse}-${key}`;

    const insertSnippet = new SnippetString(`type `);
    let typeExtensionCodeBlock = `type ${typeToUse} @key(fields:"${key}") {\n`;

    insertSnippet.appendVariable('typeToUse', typeToUse);
    insertSnippet.appendText(' @key(fields:"');
    insertSnippet.appendVariable('key', key);
    insertSnippet.appendText('") {\n');

    for (let i = 0; i < keyFields.length; i++) {
      const keyField = keyFields[i];
      const fieldLine = `\t${keyField.field}: ${keyField.type}\n`;
      typeExtensionCodeBlock += fieldLine;
      insertSnippet.appendText(fieldLine);
    }

    insertSnippet.appendText(`\t`);
    insertSnippet.appendTabstop(1);
    typeExtensionCodeBlock += '}';
    insertSnippet.appendText(`\n}`);

    const mkdDocs = new MarkdownString();
    mkdDocs.appendCodeblock(typeExtensionCodeBlock, 'graphql');
    mkdDocs.appendMarkdown(
      `To learn more about extending entities, click [here](https://www.apollographql.com/docs/federation/entities/#extending).`,
    );

    this.documentation = mkdDocs;
    this.detail = `Use entity ${typeToUse}`;
    this.insertText = insertSnippet;
  }
}
