import {
    GraphQLSchema,
    GraphQLError,
    FragmentDefinitionNode,
    findDeprecatedUsages,
    isExecutableDefinitionNode,
    DocumentNode,
    OperationDefinitionNode,
    getLocation,
    TypeInfo,
    visit,
    visitInParallel,
    visitWithTypeInfo,
    InlineFragmentNode,
    Kind,
    isObjectType,
    NoUnusedFragmentsRule,
    specifiedRules
} from "graphql";
import {
    buildExecutionContext,
    ExecutionContext
} from "graphql/execution/execute";

import { Diagnostic, DiagnosticSeverity, TextEdit } from "vscode-languageserver";

import { GraphQLDocument } from "./document";
import { hasClientDirective, highlightNodeForNode, simpleCollectFields } from "./graphql";
import { positionFromSourceLocation, rangeForASTNode } from "./source";

import { ValidationRule } from "graphql/validation/ValidationContext";
import { ValidationContext } from "graphql";
import { FieldNode } from "graphql";

function getValidationErrors(
    schema: GraphQLSchema,
    document: DocumentNode,
    fragments?: { [fragmentName: string]: FragmentDefinitionNode },
    rules: ValidationRule[] = defaultValidationRules
) {
    const typeInfo = new TypeInfo(schema);

    // The 4th argument to `ValidationContext` is an `onError` callback. This was
    // introduced by https://github.com/graphql/graphql-js/pull/2074 and first
    // published in graphql@14.5.0. It is meant to replace the `getErrors` method
    // which was previously used. Since we support versions of graphql older than
    // that, it's possible that this callback will not be invoked and we'll need
    // to resort to using `getErrors`. Therefore, although we'll collect errors
    // via this callback, if `getErrors` is present on the context we create,
    // we'll go ahead and use that instead.
    const errors: GraphQLError[] = [];
    const onError = (err: GraphQLError) => errors.push(err);
    const context = new ValidationContext(schema, document, typeInfo, onError);

    if (fragments) {
        (context as any)._fragments = fragments;
    }

    const visitors = rules.map(rule => rule(context));
    // Visit the whole document with each instance of all provided rules.
    visit(document, visitWithTypeInfo(typeInfo, visitInParallel(visitors)));

    // If `getErrors` doesn't exist, we must be on a `graphql@15` or higher,
    // so we'll use the errors we collected via the `onError` callback.
    return errors;
}
/**
 * Build an array of code diagnostics for all executable definitions in a document.
 */
export function collectExecutableDefinitionDiagnositics(
    schema: GraphQLSchema,
    queryDocument: GraphQLDocument,
    fragments: { [fragmentName: string]: FragmentDefinitionNode } = {}
): Diagnostic[] {
    const ast = queryDocument.ast;
    if (!ast) return queryDocument.syntaxErrors;

    const astWithExecutableDefinitions = {
        ...ast,
        definitions: ast.definitions.filter(isExecutableDefinitionNode)
    };

    const diagnostics = [];

    for (const error of getValidationErrors(
        schema,
        astWithExecutableDefinitions,
        fragments,
        defaultValidationRules
    )) {
        diagnostics.push(
            //@ts-ignore
            ...diagnosticsFromError(error, DiagnosticSeverity.Error, "Validation")
        );
    }

    for (const error of findDeprecatedUsages(
        schema,
        astWithExecutableDefinitions
    )) {
        diagnostics.push(
            //@ts-ignore
            ...diagnosticsFromError(error, DiagnosticSeverity.Warning, "Deprecation")
        );
    }

    return diagnostics;
}

export function diagnosticsFromError(
    error: GraphQLError,
    severity: DiagnosticSeverity,
    type: string
): GraphQLDiagnostic[] {
    if (!error.nodes) {
        return [];
    }

    return error.nodes.map(node => {
        return {
            source: `GraphQL: ${type}`,
            message: error.message,
            severity,
            range: rangeForASTNode(highlightNodeForNode(node) || node),
            error
        };
    });
}

export interface GraphQLDiagnostic extends Diagnostic {
    /**
     * The GraphQLError that produced this Diagnostic
     */
    error: GraphQLError;
}

const specifiedRulesToBeRemoved = [NoUnusedFragmentsRule];

export const defaultValidationRules: ValidationRule[] = [
    NoAnonymousQueries,
    NoTypenameAlias,
    NoMissingClientDirectives,
    ...specifiedRules.filter(rule => !specifiedRulesToBeRemoved.includes(rule))
];

export function NoAnonymousQueries(context: ValidationContext) {
    return {
        OperationDefinition(node: OperationDefinitionNode) {
            if (!node.name) {
                context.reportError(
                    new GraphQLError("Apollo does not support anonymous operations", [
                        node
                    ])
                );
            }
            return false;
        }
    };
}

export function NoTypenameAlias(context: ValidationContext) {
    return {
        Field(node: FieldNode) {
            const aliasName = node.alias && node.alias.value;
            if (aliasName == "__typename") {
                context.reportError(
                    new GraphQLError(
                        "Apollo needs to be able to insert __typename when needed, please do not use it as an alias",
                        [node]
                    )
                );
            }
        }
    };
}
function NoMissingClientDirectives(context: ValidationContext) {
    const root = context.getDocument();
    const schema = context.getSchema();

    // this isn't really execution context, but it does group the fragments and operations
    // together correctly
    // XXX we have a simplified version of this in @apollo/gateway that we could probably use
    // intead of this
    const executionContext = buildExecutionContext(
        schema,
        root,
        Object.create(null),
        Object.create(null),
        undefined,
        undefined,
        undefined
    );
    function visitor(
        node: FieldNode | InlineFragmentNode | FragmentDefinitionNode
    ) {
        // In cases where we are looking at a FragmentDefinition, there is no parent type
        // but instead, the FragmentDefinition contains the type that we can read from the
        // schema
        const parentType =
            node.kind === Kind.FRAGMENT_DEFINITION
                ? schema.getType(node.typeCondition.name.value)
                : context.getParentType();

        const fieldDef = context.getFieldDef();

        // if we don't have a type to check then we can early return
        if (!parentType) return;

        // here we collect all of the fields on a type that are marked "local"
        const clientFields =
            parentType &&
            isObjectType(parentType) &&
            parentType.clientSchema &&
            parentType.clientSchema.localFields;

        // XXXX in the case of a fragment spread, the directive could be on the fragment definition
        let clientDirectivePresent = hasClientDirective(node);

        let message = "@client directive is missing on ";
        let selectsClientFieldSet = false;
        switch (node.kind) {
            case Kind.FIELD:
                // fields are simple because we can just see if the name exists in the local fields
                // array on the parent type
                selectsClientFieldSet = Boolean(
                    clientFields && clientFields.includes(fieldDef!.name)
                );
                message += `local field "${node.name.value}"`;
                break;
            case Kind.INLINE_FRAGMENT:
            case Kind.FRAGMENT_DEFINITION:
                // XXX why isn't this type checking below?
                if (Array.isArray(executionContext)) break;

                const fields = simpleCollectFields(
                    executionContext as ExecutionContext,
                    node.selectionSet,
                    Object.create(null),
                    Object.create(null)
                );

                // once we have a list of fields on the fragment, we can compare them
                // to the list of types. The fields within a fragment need to be a
                // subset of the overall local fields types
                const fieldNames = Object.entries(fields).map(([name]) => name);
                selectsClientFieldSet = fieldNames.every(
                    field => clientFields && clientFields.includes(field)
                );
                message += `fragment ${"name" in node ? `"${node.name.value}" ` : ""
                    }around local fields "${fieldNames.join(",")}"`;
                break;
        }

        // if the field's parent is part of the client schema and that type
        // includes a field with the same name as this node, we can see
        // if it has an @client directive to resolve locally
        if (selectsClientFieldSet && !clientDirectivePresent) {
            let extensions: { [key: string]: any } | null = null;
            const name = "name" in node && node.name;
            // TODO support code actions for inline fragments, fragment spreads, and fragment definitions
            if (name && name.loc) {
                let { source, end: locToInsertDirective } = name.loc;
                if (
                    "arguments" in node &&
                    node.arguments &&
                    node.arguments.length !== 0
                ) {
                    // must insert directive after field arguments
                    const endOfArgs = source.body.indexOf(")", locToInsertDirective);
                    locToInsertDirective = endOfArgs + 1;
                }
                const codeAction: CodeActionInfo = {
                    message: `Add @client directive to "${name.value}"`,
                    edits: [
                        TextEdit.insert(
                            positionFromSourceLocation(
                                source,
                                getLocation(source, locToInsertDirective)
                            ),
                            " @client"
                        )
                    ]
                };
                extensions = { codeAction };
            }

            context.reportError(
                new GraphQLError(message, [node], null, null, null, null, extensions)
            );
        }

        // if we have selected a client field, no need to continue to recurse
        if (selectsClientFieldSet) {
            return false;
        }

        return;
    }
    return {
        InlineFragment: visitor,
        FragmentDefinition: visitor,
        Field: visitor
        // TODO support directives on FragmentSpread
    };
}

export interface CodeActionInfo {
    message: string;
    edits: TextEdit[];
}