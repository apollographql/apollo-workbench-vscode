import { parse, Source, DocumentNode } from "graphql";

import {
    Diagnostic,
    DiagnosticSeverity
} from "vscode-languageserver";

import { getRange as rangeOfTokenAtLocation } from "graphql-language-service-interface";

import { rangeInContainingDocument } from "./source";

export class GraphQLDocument {
    ast?: DocumentNode;
    syntaxErrors: Diagnostic[] = [];

    constructor(public source: Source) {
        try {
            this.ast = parse(source);
        } catch (error) {
            // Don't add syntax errors when GraphQL has been commented out
            if (maybeCommentedOut(source.body)) return;

            // A GraphQL syntax error only has a location and no node, because we don't have an AST
            // So we use the online parser to get the range of the token at that location
            const range = rangeInContainingDocument(
                source,
                rangeOfTokenAtLocation(error.locations[0], source.body)
            );
            this.syntaxErrors.push({
                severity: DiagnosticSeverity.Error,
                message: error.message,
                source: "GraphQL: Syntax",
                range
            });
        }
    }
}

function maybeCommentedOut(content: string) {
    return (
        (content.indexOf("/*") > -1 && content.indexOf("*/") > -1) ||
        content.split("//").length > 1
    );
}