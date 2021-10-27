import { parse, Source, DocumentNode } from 'graphql';

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import { rangeInContainingDocument } from './source';

export class GraphQLDocument {
  ast?: DocumentNode;
  syntaxErrors: Diagnostic[] = [];

  constructor(public source: Source) {
    try {
      this.ast = parse(source);
    } catch (error: any) {
      // Don't add syntax errors when GraphQL has been commented out
      if (maybeCommentedOut(source.body) || !error?.locations) return;

      // A GraphQL syntax error only has a location and no node, because we don't have an AST
      // So we use the online parser to get the range of the token at that location
      const loc = error.locations[0];
      const range = rangeInContainingDocument(source, {
        start: {
          line: loc.startToken.line - 1,
          character: loc.startToken.column - 1,
        },
        end: {
          line: loc.endToken.line - 1,
          character: loc.endToken.column - 1,
        },
      });
      this.syntaxErrors.push({
        severity: DiagnosticSeverity.Error,
        message: error.message,
        source: 'GraphQL: Syntax',
        range,
      });
    }
  }
}

function maybeCommentedOut(content: string) {
  return (
    (content.indexOf('/*') > -1 && content.indexOf('*/') > -1) ||
    content.split('//').length > 1
  );
}
