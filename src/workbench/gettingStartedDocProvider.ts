import { readFileSync } from "fs";
import path from "path";
import { TextDocumentContentProvider, Uri } from "vscode";

export class GettingStartedDocProvider implements TextDocumentContentProvider {
    provideTextDocumentContent(uri: Uri): string {
        let gettingStartedPath = path.join(__filename, '..', '..', '..', 'media', 'getting-started', uri.path)
        return readFileSync(gettingStartedPath, { encoding: 'utf-8' });
    }
} 