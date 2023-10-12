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
    if (code?.includes('addDirective')) {
      const codeSplit = code.split(':');
      const directive = codeSplit[1];
      const selector = new CodeAction(
        `Add ${directive}`,
        CodeActionKind.QuickFix,
      );
      selector.command = {
        command: 'current-workbench-schemas.addFederationDirective',
        title: `Add ${directive} to schema`,
        arguments: [directive, document],
      };

      selectors.push(selector);
    }

    if (selectors.length > 0) return selectors;
  }
}
