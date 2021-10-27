//Sourced from: https://github.com/graphql/graphiql
// This was necessary due to Apollo Federation packages requiring graphql@15.5.3

import { TokenPattern, CharacterStreamInterface } from './types';

export default class CharacterStream implements CharacterStreamInterface {
  private _start: number;
  private _pos: number;
  private _sourceText: string;

  constructor(sourceText: string) {
    this._start = 0;
    this._pos = 0;
    this._sourceText = sourceText;
  }

  public getStartOfToken = (): number => this._start;

  public getCurrentPosition = (): number => this._pos;

  private _testNextCharacter(pattern: TokenPattern): boolean {
    const character = this._sourceText.charAt(this._pos);
    let isMatched = false;
    if (typeof pattern === 'string') {
      isMatched = character === pattern;
    } else {
      isMatched =
        pattern instanceof RegExp
          ? pattern.test(character)
          : pattern(character);
    }
    return isMatched;
  }

  public eol = (): boolean => this._sourceText.length === this._pos;

  public sol = (): boolean => this._pos === 0;

  public peek = (): string | null => {
    return this._sourceText.charAt(this._pos)
      ? this._sourceText.charAt(this._pos)
      : null;
  };

  public next = (): string => {
    const char = this._sourceText.charAt(this._pos);
    this._pos++;
    return char;
  };

  public eat = (pattern: TokenPattern): string | undefined => {
    const isMatched = this._testNextCharacter(pattern);
    if (isMatched) {
      this._start = this._pos;
      this._pos++;
      return this._sourceText.charAt(this._pos - 1);
    }
    return undefined;
  };

  public eatWhile = (match: TokenPattern): boolean => {
    let isMatched = this._testNextCharacter(match);
    let didEat = false;

    // If a match, treat the total upcoming matches as one token
    if (isMatched) {
      didEat = isMatched;
      this._start = this._pos;
    }

    while (isMatched) {
      this._pos++;
      isMatched = this._testNextCharacter(match);
      didEat = true;
    }

    return didEat;
  };

  public eatSpace = (): boolean => this.eatWhile(/[\s\u00a0]/);

  public skipToEnd = (): void => {
    this._pos = this._sourceText.length;
  };

  public skipTo = (position: number): void => {
    this._pos = position;
  };

  public match = (
    pattern: TokenPattern,
    consume: boolean | null | undefined = true,
    caseFold: boolean | null | undefined = false,
  ): Array<string> | boolean => {
    let token: string | null = null;
    let match: RegExpMatchArray | boolean | null = null;

    if (typeof pattern === 'string') {
      const regex = new RegExp(pattern, caseFold ? 'i' : 'g');
      match = regex.test(this._sourceText.substr(this._pos, pattern.length));
      token = pattern;
    } else if (pattern instanceof RegExp) {
      match = this._sourceText.slice(this._pos).match(pattern);
      token = match && match[0];
    }

    if (match != null) {
      if (
        typeof pattern === 'string' ||
        (match instanceof Array &&
          // String.match returns 'index' property, which flow fails to detect
          // for some reason. The below is a workaround, but an easier solution
          // is just checking if `match.index === 0`
          this._sourceText.startsWith(match[0], this._pos))
      ) {
        if (consume) {
          this._start = this._pos;
          if (token && token.length) {
            this._pos += token.length;
          }
        }
        return match;
      }
    }

    // No match available.
    return false;
  };

  public backUp = (num: number): void => {
    this._pos -= num;
  };

  public column = (): number => this._pos;

  public indentation = (): number => {
    const match = this._sourceText.match(/\s*/);
    let indent = 0;
    if (match && match.length !== 0) {
      const whitespaces = match[0];
      let pos = 0;
      while (whitespaces.length > pos) {
        if (whitespaces.charCodeAt(pos) === 9) {
          indent += 2;
        } else {
          indent++;
        }
        pos++;
      }
    }

    return indent;
  };

  public current = (): string => this._sourceText.slice(this._start, this._pos);
}
