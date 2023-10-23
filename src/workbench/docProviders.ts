import { getOperationAST, parse, print } from 'graphql';
import { resolve } from 'path';
import { TextDecoder, TextEncoder } from 'util';
import {
  Disposable,
  EventEmitter,
  FileChangeEvent,
  FileStat,
  FileSystemProvider,
  FileType,
  TextDocumentContentProvider,
  TreeItem,
  Uri,
  window,
  workspace,
} from 'vscode';
import { FileProvider } from './file-system/fileProvider';

export class DesignOperationsDocumentProvider implements FileSystemProvider {
  static scheme = 'workbench';
  static Uri(wbFilePath: string, operationName: string): Uri {
    return Uri.parse(
      `${DesignOperationsDocumentProvider.scheme}:${resolve(
        operationName,
      )}.graphql?${wbFilePath}`,
    );
  }

  onDidChangeEmitter = new EventEmitter<FileChangeEvent[]>();
  onDidChangeFile = this.onDidChangeEmitter.event;

  readFile(uri: Uri): Uint8Array | Thenable<Uint8Array> {
    const { operationName, wbFilePath } = this.getDetails(uri);
    const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
    const document = wbFile.operations[operationName].document;

    return new TextEncoder().encode(print(parse(document)));
  }
  writeFile(
    uri: Uri,
    content: Uint8Array,
    options: { readonly create: boolean; readonly overwrite: boolean },
  ): void | Thenable<void> {
    const { operationName, wbFilePath } = this.getDetails(uri);
    const formattedDoc = print(parse(content.toString()));
    const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);

    if (wbFile.operations[operationName].document)
      wbFile.operations[operationName].document = formattedDoc;
    else wbFile.operations[operationName] = { document: formattedDoc };

    return FileProvider.instance.writeWorkbenchConfig(
      wbFilePath,
      wbFile,
      false,
    );
  }

  private getDetails(uri: Uri) {
    return {
      operationName: uri.path.split('.')[0].replaceAll('/', ''),
      wbFilePath: uri.query,
    };
  }

  //Methods not used
  watch(
    uri: Uri,
    options: {
      readonly recursive: boolean;
      readonly excludes: readonly string[];
    },
  ): Disposable {
    return new Disposable(() => undefined);
  }
  stat(uri: Uri): FileStat | Thenable<FileStat> {
    const now = Date.now();
    return {
      ctime: now,
      mtime: now,
      size: 0,
      type: FileType.File,
    };
  }
  readDirectory(
    uri: Uri,
  ): [string, FileType][] | Thenable<[string, FileType][]> {
    throw new Error('Method not implemented.');
  }
  createDirectory(uri: Uri): void | Thenable<void> {
    throw new Error('Method not implemented.');
  }
  delete(
    uri: Uri,
    options: { readonly recursive: boolean },
  ): void | Thenable<void> {
    throw new Error('Method not implemented.');
  }
  rename(
    oldUri: Uri,
    newUri: Uri,
    options: { readonly overwrite: boolean },
  ): void | Thenable<void> {
    throw new Error('Method not implemented.');
  }
  copy?(
    source: Uri,
    destination: Uri,
    options: { readonly overwrite: boolean },
  ): void | Thenable<void> {
    throw new Error('Method not implemented.');
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

export enum Preloaded {
  SpotifyShowcase = 1,
  RetailSupergraph = 2,
}
export class PreloadedSchemaProvider implements TextDocumentContentProvider {
  static scheme = 'apollo-workbench-preloaded-schema';
  static Uri(wbFilePath: string, subgraphName: string): Uri {
    return Uri.parse(
      `${ApolloRemoteSchemaProvider.scheme}:${subgraphName}.graphql?${wbFilePath}#${subgraphName}`,
    );
  }
  static async Open(wbFilePath: string, subgraphName: string) {
    const uri = Uri.parse(
      `${PreloadedSchemaProvider.scheme}:${subgraphName}.graphql?${wbFilePath}#${subgraphName}`,
    );
    await window.showTextDocument(uri, { preview: true });
  }
  async provideTextDocumentContent(uri: Uri): Promise<string> {
    const wbFilePath = uri.query;
    const subgraphName = uri.fragment;
    const schemaFilePath = resolve(
      `${wbFilePath.split('.yaml')[0]}-schemas`,
      `${subgraphName}.graphql`,
    );

    const content = await workspace.fs.readFile(Uri.parse(schemaFilePath));
    return new TextDecoder().decode(content);
  }
}
