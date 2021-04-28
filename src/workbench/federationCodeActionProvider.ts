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
    let code = context.diagnostics[0]?.code as string;
    let selectors: CodeAction[] = [];
    if (code.includes('makeArray')) {
      let line = document.lineAt(range.start.line);
      let trimmedText = line.text.trim();
      if (trimmedText != '[' && trimmedText != '[]' && trimmedText != '[ ]') {
        let selector = new CodeAction('Make array', CodeActionKind.QuickFix);
        selector.command = {
          command: 'current-workbench-schemas.makeSchemaDocTextRangeArray',
          title: 'Make into array',
          arguments: [document, range],
        };

        selectors.push(selector);
      }
    }
    if (code.includes('deleteRange')) {
      let selector = new CodeAction(
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
