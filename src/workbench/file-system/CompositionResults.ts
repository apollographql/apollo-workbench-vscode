export class CompositionResults {
  data: {
    success: boolean;
    core_schema?: string;
    hints?: RoverCompositionHint[];
  } = { success: false };
  error?: RoverError;
}

type RoverCompositionHint = {
  message: string;
};

export type RoverError = {
  code: string;
  message: string;
  details: { build_errors: RoverCompositionError[] };
};

export type RoverCompositionError = {
  code: string;
  message: string;
  nodes: ErrorNode[];
};

type ErrorNode = {
  subgraph: string;
  source: string;
  start: Position;
  end: Position;
};

type Position = {
  start: number;
  end: number;
  line: number;
  column: number;
};
