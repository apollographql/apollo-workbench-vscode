import { visit } from 'graphql';
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
  workspace,
} from 'vscode';
import { getFileName } from '../utils/path';
import { ApolloConfig } from './file-system/ApolloConfig';
import { FileProvider, tempSchemaFilePath } from './file-system/fileProvider';
import { Rover } from './rover';

export class FederationReferenceProvider implements ReferenceProvider {
  provideReferences(
    document: TextDocument,
    position: Position,
    context: ReferenceContext,
    token: CancellationToken,
  ): ProviderResult<Location[]> {
    const uri = document.uri;

    const locations: Location[] = [];


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
        if (!wbFile) return locations;

        const lineText = document.lineAt(text.start.line).text;
        if (lineText.startsWith('type')) {
          const type = lineText.substring(
            text.start.character,
            text.end.character,
          );
          Object.keys(wbFile?.subgraphs).forEach(async (name) => {
            if (name != subgraphName) {
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
                uri = tempSchemaFilePath(wbFilePath, name);
              } else {
                sdl = await Rover.instance.subgraphFetch(subgraph);
              }

              visit(gql(sdl), {
                ObjectTypeDefinition(node) {
                  if (node.name.value == type) {
                    const range = new Range(
                      node.loc?.startToken.line ?? 0,
                      node.loc?.startToken.column ?? 0,
                      node.loc?.endToken.line ?? 0,
                      node.loc?.endToken.column ?? 0,
                    );
                    locations.push({ uri, range });
                  }
                },
              });
            }
          });
        }
      }
    }

    return locations;
  }
}
