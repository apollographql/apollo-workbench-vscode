
import { exec, ExecException } from 'child_process';
import { Subgraph } from './file-system/ApolloConfig';
import { CompositionResults } from './file-system/CompositionResults';

export class Rover {
  private static _instance: Rover;
  static get instance(): Rover {
    if (!this._instance) this._instance = new Rover();

    return this._instance;
  }

  async compose(pathToConfig: string) {
    const result = await new Promise<string>((resolve, reject) => {
      exec(
        `rover supergraph compose --config=${pathToConfig} --output=json`,
        {},
        (_error: ExecException | null, stdout: string, _stderr: string) =>{
          resolve(stdout);
        }
      );
    });

    return JSON.parse(result) as CompositionResults;
  }

  async writeSupergraphSDL(pathToConfig: string, pathToSaveTo: string) {
    await new Promise<string>((resolve, reject) => {
      exec(
        `rover supergraph compose --config=${pathToConfig} > ${pathToSaveTo}`,
        {},
        (_error: ExecException | null, stdout: string, _stderr: string) =>{
          resolve(stdout);
        }
      );
    });
  }

  async subgraphFetch(subgraph: Subgraph){
    let sdl = '';
    if (subgraph.schema.graphref) {
      //sdl = rover subgraph fetch graphref
      sdl = await this.subgraphGraphOSFetch(subgraph.schema.graphref, subgraph.name);
    } else {
      //sdl = rover subgraph introspect ?? rover graph introspect
      sdl = await this.subgraphIntrospect(subgraph.schema.subgraph_url);
    }

    return sdl;
  }

  async subgraphGraphOSFetch(graphRef: string, subgraph: string) {
    const result = await new Promise<string>((resolve, reject) => {
      exec(
        `rover subgraph fetch ${graphRef} --name=${subgraph}`,
        {},
        (_error: ExecException | null, stdout: string, _stderr: string) =>{
          resolve(stdout);
        }
      );
    });

    return result as string;
  }
  async subgraphIntrospect(url: string) {
    let sdl = await new Promise<string | boolean>((resolve, reject) => {
      exec(
        `rover subgraph introspect ${url}`,
        {},
        (error: ExecException | null, stdout: string, _stderr: string) =>{
          if(error) reject(false);
          else resolve(stdout);
        }
      );
    });

    if(!sdl) {
      sdl = await new Promise<string | boolean>((resolve, reject) => {
        exec(
          `rover graph introspect ${url}`,
          {},
          (error: ExecException | null, stdout: string, _stderr: string) =>{
            if(error) reject(false);
            else resolve(stdout);
          }
        );
      });
    }

    if(!sdl) return "";

    return sdl as string ?? "";
  }
}
