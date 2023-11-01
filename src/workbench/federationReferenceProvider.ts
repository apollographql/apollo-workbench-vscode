import {
  Kind,
  NameNode,
  ObjectTypeDefinitionNode,
  TypeInfo,
  TypeNode,
  buildSchema,
  parse,
  visit,
  visitWithTypeInfo,
} from 'graphql';
import gql from 'graphql-tag';
import {
  CancellationToken,
  Location,
  Position,
  ProviderResult,
  Range,
  ReferenceContext,
  ReferenceProvider,
  TextDocument,
  Uri,
  window,
  workspace,
} from 'vscode';
import { getFileName } from '../utils/path';
import { ApolloConfig } from './file-system/ApolloConfig';
import { FileProvider, tempSchemaFilePath } from './file-system/fileProvider';
import { Rover } from './rover';
import { start } from 'repl';
import { log } from '../utils/logger';

export class FederationReferenceProvider implements ReferenceProvider {
  provideReferences(
    document: TextDocument,
    position: Position,
    context: ReferenceContext,
    token: CancellationToken,
  ): ProviderResult<Location[]> {
    const uri = document.uri;

    //We cannot assume the filepaths name is actually the subgraph name, we need to reference the config file
    //Go through config files and find out which one has a matching workbench_design, file or tempSchemaPath path
    const subgraphName = getFileName(uri.fsPath);

    if (subgraphName) {
      let wbFilePath = '';
      const wbFiles = FileProvider.instance.getWorkbenchFiles();
      wbFiles.forEach((wbFile, filePath) => {
        if (Object.keys(wbFile.subgraphs).includes(subgraphName)) {
          wbFilePath = filePath;
        }
      });

      if (wbFilePath != '') {
        //Need to find references in other schema files
        const text = document.getWordRangeAtPosition(position);
        if (!text ?? !text?.isSingleLine) return;

        const wbFile = wbFiles.get(wbFilePath);
        if (!wbFile) return undefined;

        const lineText = document.lineAt(text.start.line).text;
        if (lineText.startsWith('type')) {
          const type = lineText.substring(
            text.start.character,
            text.end.character,
          );

          return this.findTypeReferences(wbFile, wbFilePath, type);
        }
      }
    }

    return undefined;
  }

  private async findTypeReferences(
    wbFile: ApolloConfig,
    wbFilePath: string,
    type: string,
  ) {
    const locations: Location[] = [];

    for (const name in wbFile.subgraphs) {
      let sdl = '';
      let uri: Uri;
      const subgraph = wbFile?.subgraphs[name];
      if (subgraph.schema.workbench_design) {
        uri = Uri.parse(subgraph.schema.workbench_design);
        const file = await workspace.fs.readFile(uri);
        sdl = file.toString();
      } else if (subgraph.schema.graphref) {
        sdl = await Rover.instance.subgraphGraphOSFetch(
          subgraph.schema.graphref,
          subgraph.schema.subgraph ?? name,
        );
        if (!sdl) {
          log('Not authenticated. Must run rover config auth');
          window
            .showErrorMessage(
              'Fetching schemas from GraphOS requires you to authenticate the Rover CLI with your User API key.',
              { modal: true },
            )
            .then(() => {
              const term = window.createTerminal('rover config auth');
              term.sendText('rover config auth');
              term.show();
            });
        }

        uri = tempSchemaFilePath(wbFilePath, name);
      } else if (subgraph.schema.file) {
        uri = Uri.parse(subgraph.schema.file);
        const file = await workspace.fs.readFile(uri);
        sdl = file.toString();
      } else {
        sdl = await Rover.instance.subgraphFetch(subgraph);
      }

      const getRange = (
        node: ObjectTypeDefinitionNode | NameNode | TypeNode,
      ) => {
        if (!node.loc) return new Range(0, 0, 0, 0);
        const startLine =
          node.loc.startToken.line > 0 ? node.loc.startToken.line - 1 : 0;
        const startCharacter =
          node.loc.startToken.column > 0 ? node.loc.startToken.column - 1 : 0;
        const endLine =
          node.loc.endToken.line > 0 ? node.loc.endToken.line - 1 : 0;
        const endCharacter =
          startCharacter + (node.loc.endToken.end - node.loc.endToken.start);
        return new Range(startLine, startCharacter, endLine, endCharacter);
      };

      visit(parse(sdl), {
        ObjectTypeDefinition(node) {
          if (node.name.value == type && node.loc) {
            locations.push({
              uri,
              range: getRange(node.name),
            });
          } else {
            node.fields?.forEach((field) => {
              let found = false;
              let fieldType = field.type;
              let fieldNamedType;
              while (!found) {
                if (fieldType.kind == Kind.NAMED_TYPE) {
                  fieldNamedType = fieldType.name.value;
                  found = true;
                } else {
                  fieldType = fieldType.type;
                }
              }
              if (fieldNamedType == type) {
                if (fieldType.loc) {
                  locations.push({
                    uri,
                    range: getRange(fieldType),
                  });
                }
              }
            });
          }
        },
      });
    }

    return locations;
  }
}
