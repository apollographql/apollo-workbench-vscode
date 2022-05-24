import {
    Source,
    ASTNode,
    BREAK,
    TypeInfo,
    getVisitFn,
    ASTKindToNode
} from "graphql";
import { SourceLocation, getLocation } from "graphql/language/location";

import { Position, Range } from "vscode-languageserver";

function isNode(maybeNode: any): maybeNode is ASTNode {
    return maybeNode && typeof maybeNode.kind === "string";
}

// XXX temp fix to silence ts errors with `apply`
type applyArg = [
    any,
    string | number | undefined,
    any,
    readonly (string | number)[],
    readonly any[]
];


function positionInContainingDocument(
    source: Source,
    position: Position
): Position {
    if (!source.locationOffset) return position;
    return Position.create(
        source.locationOffset.line - 1 + position.line,
        position.character
    );
}

export function rangeInContainingDocument(source: Source, range: Range): Range {
    if (!source.locationOffset) return range;
    return Range.create(
        positionInContainingDocument(source, range.start),
        positionInContainingDocument(source, range.end)
    );
}

export function rangeForASTNode(node: ASTNode): Range {
    const location = node.loc!;
    const source = location.source;

    return Range.create(
        positionFromSourceLocation(source, getLocation(source, location.start)),
        positionFromSourceLocation(source, getLocation(source, location.end))
    );
}

export function positionFromSourceLocation(
    source: Source,
    location: SourceLocation
) {
    return Position.create(
        (source.locationOffset ? source.locationOffset.line - 1 : 0) +
        location.line -
        1,
        (source.locationOffset && location.line === 1
            ? source.locationOffset.column - 1
            : 0) +
        location.column -
        1
    );
}