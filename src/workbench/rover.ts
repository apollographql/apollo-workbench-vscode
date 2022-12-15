import { buildSubgraphSchema } from '@apollo/federation';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { exec, ExecException } from 'child_process';
import gql from 'graphql-tag';
import { resolve } from 'path';
import { TextDecoder } from 'util';
import { Progress, Terminal, Uri, window, workspace } from 'vscode';
import { ApolloConfig, Subgraph } from './file-system/ApolloConfig';
import { CompositionResults } from './file-system/CompositionResults';
import { StateManager } from './stateManager';
import { addMocksToSchema } from '@graphql-tools/mock';
import { FieldWithType } from './federationCompletionProvider';
import { parse, StringValueNode, visit } from 'graphql';
export class Rover {
  private static _instance: Rover;
  static get instance(): Rover {
    if (!this._instance) this._instance = new Rover();

    return this._instance;
  }

  primaryDevTerminal: Terminal | undefined;
  private secondaryDevTerminals: Terminal[] = [];

  async compose(pathToConfig: string) {
    const result = await new Promise<string>((resolve, reject) => {
      const configProfile = StateManager.settings_roverConfigProfile;
      exec(
        configProfile
          ? `rover supergraph compose --config="${pathToConfig}" --output=json --profile=${configProfile}`
          : `rover supergraph compose --config="${pathToConfig}" --output=json`,
        {},
        (_error: ExecException | null, stdout: string, _stderr: string) => {
          resolve(stdout);
        },
      );
    });

    return JSON.parse(result) as CompositionResults;
  }

  async writeSupergraphSDL(pathToConfig: string, pathToSaveTo: string) {
    await new Promise<string>((resolve, reject) => {
      exec(
        `rover supergraph compose --config=${pathToConfig} > ${pathToSaveTo}`,
        {},
        (_error: ExecException | null, stdout: string, _stderr: string) => {
          resolve(stdout);
        },
      );
    });
  }

  async subgraphFetch(subgraph: Subgraph) {
    let sdl = '';
    if (subgraph.schema.graphref) {
      sdl = await this.subgraphGraphOSFetch(
        subgraph.schema.graphref,
        subgraph.subgraph,
      );
    } else {
      sdl = await this.subgraphIntrospect(
        subgraph.schema.subgraph_url ?? subgraph.routing_url ?? '',
      );
    }

    return sdl;
  }

  async subgraphGraphOSFetch(graphRef: string, subgraph: string) {
    const configProfile = StateManager.settings_roverConfigProfile;
    const result = await new Promise<string>((resolve, reject) => {
      exec(
        configProfile
          ? `rover subgraph fetch ${graphRef} --name=${subgraph} --profile=${configProfile}`
          : `rover subgraph fetch ${graphRef} --name=${subgraph}`,
        {},
        (_error: ExecException | null, stdout: string, _stderr: string) => {
          resolve(stdout);
        },
      );
    });

    return result as string;
  }
  async subgraphIntrospect(url: string) {
    let sdl = await new Promise<string | boolean>((resolve, reject) => {
      exec(
        `rover subgraph introspect ${url}`,
        {},
        (error: ExecException | null, stdout: string, _stderr: string) => {
          if (error) resolve(false);
          else resolve(stdout);
        },
      );
    });

    if (!sdl) {
      sdl = await new Promise<string | boolean>((resolve, reject) => {
        exec(
          `rover graph introspect ${url}`,
          {},
          (error: ExecException | null, stdout: string, _stderr: string) => {
            if (error) resolve(false);
            else resolve(stdout);
          },
        );
      });
    }

    if (!sdl) return '';

    return (sdl as string) ?? '';
  }

  async getProfiles(): Promise<string[]> {
    const results = await new Promise<string>((resolve, reject) => {
      exec(
        `rover config list --output=json`,
        {},
        (error: ExecException | null, stdout: string, _stderr: string) => {
          if (error) reject(false);
          else resolve(stdout);
        },
      );
    });
    const data = JSON.parse(results).data;
    if (data.success) {
      return data.profiles;
    } else return [];
  }
  //For any subgraph being mocked, we will store a port mapping of subgraphName to port
  portMapping: { [subgraphName: string]: number } = {};
  //subgraphState will hold the ApolloServer instances based on the ports they are running on
  private subgraphState: { [port: number]: ApolloServer } = {};
  ports: number[] = [];

  private getNextAvailablePort() {
    let port = StateManager.settings_startingServerPort;
    while (this.subgraphState[port]) port++;

    return port;
  }

  async restartMockedSubgraph(subgraphName: string, schemaUri: Uri) {
    if(!this.primaryDevTerminal) return;
    
    let port = 0;
    for (const sn in this.portMapping)
      if (sn == subgraphName) port = this.portMapping[sn];

    if (port != 0) {
      this.stopSubgraphOnPort(port);
      await this.startMockedSubgraph(subgraphName, schemaUri, port);
    }
  }

  async startMockedSubgraph(
    subgraphName: string,
    schemaUri: Uri,
    port?: number,
  ) {
    if (!port)
      port = this.portMapping[subgraphName] ?? this.getNextAvailablePort();

    try {
      const schemaDesign = await workspace.fs.readFile(schemaUri);
      const schemaString = new TextDecoder().decode(schemaDesign);
      const typeDefs = gql(schemaString);
      //Dynamically create __resolveReference resolvers based on defined entites in Graph
      const resolvers = {};
      const entities = Rover.extractDefinedEntities(schemaString);
      Object.keys(entities).forEach(
        (entity) =>
          (resolvers[entity] = {
            __resolveReference(parent, args) {
              return { ...parent };
            },
          }),
      );
      const schema = buildSubgraphSchema({ typeDefs });
      const server = new ApolloServer({
        schema: addMocksToSchema({ schema, preserveResolvers: true }),
      });

      //Set the port and server to local state
      this.subgraphState[port] = server;
      this.portMapping[subgraphName] = port;

      const { url } = await startStandaloneServer(server, {
        listen: { port },
      });

      return url;
    } catch (err) {
      this.subgraphState[port].stop();
      delete this.subgraphState[port];

      console.log('unable to start mocked subgraph');
      return undefined;
    }
  }
  private stopSubgraphOnPort(port: number) {
    let subgraphName = '';
    for (const sn in this.portMapping)
      if (this.portMapping[sn] == port) subgraphName = sn;

    this.subgraphState[port].stop();
    delete this.subgraphState[port];

    if (this.portMapping[subgraphName]) delete this.portMapping[subgraphName];
  }

  async stopRoverDev() {
    if (Rover.instance.primaryDevTerminal) {
      Rover.instance.primaryDevTerminal.sendText('\x03');
      Rover.instance.primaryDevTerminal.dispose();
    }

    Rover.instance.secondaryDevTerminals.forEach((t) => {
      t.sendText('\x03');
      t.dispose();
    });

    Rover.instance.primaryDevTerminal = undefined;
    Rover.instance.secondaryDevTerminals = [];

    for (const port in Rover.instance.subgraphState) {
      Rover.instance.stopSubgraphOnPort(Number.parseInt(port));
    }
    Rover.instance.portMapping = {};

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  startRoverDevSession(
    subgraphName: string,
    routingUrl: string,
    schemaPath?: string,
  ) {
    let terminal: Terminal;
    const terminalName = `${subgraphName} - rover dev`;
    if (!this.primaryDevTerminal) {
      this.primaryDevTerminal = window.createTerminal(terminalName);
      terminal = this.primaryDevTerminal;
    } else {
      terminal = window.createTerminal(terminalName);
      this.secondaryDevTerminals.push(terminal);
    }

    if (schemaPath) {
      terminal.sendText(
        `rover dev --name=${subgraphName} --url=${routingUrl} --schema="${schemaPath}"`,
      );
    } else {
      terminal.sendText(`rover dev --name=${subgraphName} --url=${routingUrl}`);
    }
  }

  static extractDefinedEntities(schema: string) {
    const entities: {
      [entity: string]: FieldWithType[];
    } = {};

    try {
      visit(parse(schema), {
        ObjectTypeDefinition(node) {
          const keyDirective = node.directives?.find(
            (d) => d.name.value == 'key',
          );
          if (keyDirective) {
            const keyBlock = (
              keyDirective.arguments?.find((a) => a.name.value == 'fields')
                ?.value as StringValueNode
            )?.value;
            const parsedFields: string[] = [];
            let startIndex = -1;
            let notComposite = true;
            for (let i = 0; i < keyBlock.length; i++) {
              let lastParsedField = '';
              const char = keyBlock[i];
              switch (char) {
                case ' ':
                  if (startIndex != -1 && notComposite) {
                    lastParsedField = keyBlock.substring(startIndex, i);
                    parsedFields.push(lastParsedField);
                  }

                  startIndex = -1;
                  break;
                case '{':
                  notComposite = false;
                  break;
                case '}':
                  notComposite = true;
                  break;
                default:
                  if (startIndex == 0 && i == keyBlock.length - 1)
                    parsedFields.push(keyBlock);
                  else if (i == keyBlock.length - 1)
                    parsedFields.push(keyBlock.substring(startIndex));
                  else if (startIndex == -1) startIndex = i;
                  break;
              }
            }
            entities[node.name.value] = [];

            parsedFields.forEach((parsedField) => {
              const finalKey = keyBlock.trim();
              const field = node.fields?.find(
                (f) => f.name.value == parsedField,
              );
              let fieldType = '';
              if (field) fieldType = Rover.getFieldTypeString(field);

              entities[node.name.value].push({
                field: parsedField,
                type: fieldType,
              });
            });
          }
        },
      });
    } catch (err: any) {
      console.log(err);
    }

    return entities;
  }
  private static getFieldTypeString(field): string {
    switch (field.kind) {
      case 'FieldDefinition':
        return this.getFieldTypeString(field.type);
      case 'ListType':
        return `[${this.getFieldTypeString(field.type)}]`;
      case 'NamedType':
        return field.name.value;
      //Need to add the ! for NonNull
      case 'NonNullType':
        switch (field.type.kind) {
          case 'ListType':
            return `${this.getFieldTypeString(field.type)}!`;
          case 'NamedType':
            return `${field.type.name.value}!`;
        }
        return '';
      default:
        return '';
    }
  }
}
