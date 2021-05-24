import { readFileSync } from 'fs';
import { getOperationAST, parse, print } from 'graphql';
import path from 'path';
import { TextDocumentContentProvider, Uri } from 'vscode';

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
  implements TextDocumentContentProvider {
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
