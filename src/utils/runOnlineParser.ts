
import { zip } from 'lodash';
import { Position, Range } from "vscode";
import { CharacterStream, onlineParser, State } from "graphql-language-service-parser";

export function runOnlineParser(
    documentText: string,
    callback: (
        state: State,
        ruleRange: Range,
        tokens: Node['tokens'],
    ) => void,
) {
    runOnlineParserInternal(documentText).forEach((rule) =>
        callback(rule.state, rule.range, rule.tokens),
    );
}

function getAncestorStates(state: State): State[] {
    const stateAncestors = [state];
    let currentState = state;
    while (currentState.prevState) {
        stateAncestors.push(currentState.prevState);
        currentState = currentState.prevState;
    }
    stateAncestors.reverse();
    return stateAncestors;
}
interface Rule {
    state: State;
    range: Range;
    tokens: Node['tokens'];
}
interface Node {
    state: State;
    range: Range;
    tokens: Array<{ range: Range; state: State }>;
}

function runOnlineParserInternal(documentText: string): Rule[] {
    const lines = documentText.split('\n');
    const parser = onlineParser();
    let mutableState: State = { ...parser.startState() };
    let savedAncestorStates: Node[] = [];
    const allRules: Rule[] = [];
    lines.forEach((line, lineIndex) => {
        const stream = new CharacterStream(`${line}\n`);
        while (!stream.eol()) {
            const tokenType = parser.token(stream, mutableState);
            // Aliased fields do not have their alias in the state, instead we get
            // two different names at different steps in the rule. Attach the name
            // for the first two steps as an alias.
            if (mutableState.kind === 'AliasedField' && mutableState.step < 2) {
                // mutableState.alias = mutableState.name;
            }
            const state: State = { ...mutableState };
            const ancestorStates = getAncestorStates(state);
            // monaco positions
            const lineNumber = lineIndex;
            const startColumn = stream.getStartOfToken();
            const endColumn = stream.getCurrentPosition();
            const tokenRange = new Range(
                lineNumber,
                startColumn,
                lineNumber,
                endColumn,
            );
            const lastState = savedAncestorStates.length
                ? savedAncestorStates.slice(-1)[0]
                : undefined;
            if (
                lastState &&
                lastState.state.kind === state.kind &&
                lastState.state.step <= state.step &&
                ancestorStates.length === savedAncestorStates.length
            ) {
                // Continuing previous rule
                // For each ancestor, send an incomplete callback
                // These are non null as we checked
                // `ancestorStates.length === savedAncestorStates.length` above
                (zip(ancestorStates, savedAncestorStates) as [
                    State,
                    Node,
                ][]).forEach(
                    ([ancestorState, savedAncestorState]: [State, Node]) => {
                        // eslint-disable-next-line no-param-reassign
                        savedAncestorState.state = ancestorState;
                        if (tokenType !== 'ws') {
                            // eslint-disable-next-line no-param-reassign
                            savedAncestorState.range = savedAncestorState.range.with(
                                undefined,
                                new Position(lineNumber, endColumn)
                            );
                        }
                    },
                );
            } else {
                // Starting a new rule
                let ancestorsToAdd: Node[] = [];
                let includePunctuation = false;
                // For each node that this is not a part of (complete nodes), call
                // the callback
                const ancestorPairs = zip(ancestorStates, savedAncestorStates);
                ancestorPairs.reverse();
                // eslint-disable-next-line no-loop-func
                ancestorPairs.forEach(([ancestorState, savedAncestorState]) => {
                    // Node matched, update saved node
                    if (
                        ancestorState &&
                        savedAncestorState &&
                        savedAncestorState.state.kind === ancestorState.kind &&
                        (savedAncestorState.state.step === ancestorState.step ||
                            ancestorState.step > 1 ||
                            // `FragmentSpread`s start parsing at step 1
                            (ancestorState.step > 0 &&
                                savedAncestorState.state.kind !== 'FragmentSpread'))
                    ) {
                        // eslint-disable-next-line no-param-reassign
                        savedAncestorState.state = ancestorState;
                        if (tokenType !== 'ws') {
                            // eslint-disable-next-line no-param-reassign
                            savedAncestorState.range = savedAncestorState.range.with(
                                undefined,
                                new Position(lineNumber, endColumn)
                            );
                        }
                    } else {
                        if (savedAncestorState) {
                            // Update node and call the complete callback.
                            // Punctuation is not included as part of the rule, add it
                            // manually.
                            const rule = savedAncestorState.state.rule;
                            const finalRule = Array.isArray(rule) && rule.slice(-1)[0];
                            if (
                                includePunctuation ||
                                (finalRule &&
                                    typeof finalRule === 'object' &&
                                    finalRule.style === 'punctuation')
                            ) {
                                // eslint-disable-next-line no-param-reassign
                                savedAncestorState.range = savedAncestorState.range.with(
                                    undefined,
                                    new Position(lineNumber, startColumn + 1)
                                );
                                includePunctuation = true;
                            }
                            allRules.push(savedAncestorState);
                            savedAncestorStates.pop();
                        }
                        if (ancestorState) {
                            const newAncestor = {
                                state: ancestorState,
                                range: tokenRange,
                                tokens: [],
                            };
                            ancestorsToAdd = [newAncestor, ...ancestorsToAdd];
                        }
                    }
                });
                savedAncestorStates = [...savedAncestorStates, ...ancestorsToAdd];
            }
            if (tokenType !== 'ws' && savedAncestorStates.length) {
                savedAncestorStates.forEach((savedAncestorState) => {
                    savedAncestorState.tokens.push({ range: tokenRange, state });
                });
            }
        }
        // If we reached an invalid state, reset to the base Document state
        if (!mutableState.kind) {
            mutableState = parser.startState();
        }
    });
    while (savedAncestorStates.length) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        allRules.push(savedAncestorStates.pop()!);
    }
    return allRules;
}