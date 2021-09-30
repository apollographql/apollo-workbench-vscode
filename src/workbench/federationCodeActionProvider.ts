import {
  CodeAction,
  CodeActionKind,
  CodeActionProvider,
  CodeActionContext,
  Range,
  TextDocument,
} from 'vscode';

export class FederationCodeActionProvider implements CodeActionProvider {
  public provideCodeActions(
    document: TextDocument,
    range: Range,
    context: CodeActionContext,
  ): CodeAction[] | undefined {
    const code = context.diagnostics[0]?.code as string;
    const selectors: CodeAction[] = [];
    if (code?.includes('makeArray')) {
      const line = document.lineAt(range.start.line);
      const trimmedText = line.text.trim();
      if (trimmedText != '[' && trimmedText != '[]' && trimmedText != '[ ]') {
        const selector = new CodeAction('Make array', CodeActionKind.QuickFix);
        selector.command = {
          command: 'current-workbench-schemas.makeSchemaDocTextRangeArray',
          title: 'Make into array',
          arguments: [document, range],
        };

        selectors.push(selector);
      }
    }
    if (code?.includes('deleteRange')) {
      const selector = new CodeAction(
        'Delete this selection',
        CodeActionKind.QuickFix,
      );
      selector.command = {
        command: 'current-workbench-schemas.deleteSchemaDocTextRange',
        title: 'Delete this selection',
        arguments: [document, range],
      };

      selectors.push(selector);
    }

    if (selectors.length > 0) return selectors;
  }
}
