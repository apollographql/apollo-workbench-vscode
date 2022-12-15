import { readFileSync } from 'fs';
import { getOperationAST, parse, print } from 'graphql';
import path from 'path';
import { TextDecoder } from 'util';
import { TextDocumentContentProvider, Uri, workspace } from 'vscode';
import { FileProvider } from './file-system/fileProvider';

export class GettingStartedDocProvider implements TextDocumentContentProvider {
  static scheme = 'getting-started';
  provideTextDocumentContent(uri: Uri): string {
    const gettingStartedPath = path.join(
      __filename,
      '..',
      '..',
      '..',
      'media',
      'getting-started',
      uri.path,
    );
    return readFileSync(gettingStartedPath, { encoding: 'utf-8' });
  }
}

export class ApolloStudioOperationsProvider
  implements TextDocumentContentProvider
{
  static scheme = 'apollo-studio-operations';
  static Uri(operationName: string, document: string): Uri {
    return Uri.parse(
      `${ApolloStudioOperationsProvider.scheme}:${operationName}.graphql?${document}`,
    );
  }
  provideTextDocumentContent(uri: Uri): string {
    const operationName = uri.path.split('.graphql')[0];
    const doc = parse(uri.query);
    const ast = getOperationAST(doc, operationName);
    if (ast) return print(ast);
    return uri.query;
  }
}

export class ApolloRemoteSchemaProvider implements TextDocumentContentProvider {
  static scheme = 'apollo-workbench-remote-schema';
  static Uri(wbFilePath: string, subgraphName: string): Uri {
    return Uri.parse(
      `${ApolloRemoteSchemaProvider.scheme}:${subgraphName}.graphql?${wbFilePath}#${subgraphName}`,
    );
  }
  async provideTextDocumentContent(uri: Uri): Promise<string> {
    const wbFilePath = uri.query;
    const subgraphName = uri.fragment;
    const tempUri = await FileProvider.instance.writeTempSchemaFile(
      wbFilePath,
      subgraphName,
    );
    if (!tempUri) return 'Unable to get remote schema';

    const content = await workspace.fs.readFile(tempUri);
    return new TextDecoder().decode(content);
  }
}
