import { resolve } from 'path';
import { create } from 'archiver';
import { createWriteStream } from 'fs';
import { StateManager } from '../workbench/stateManager';
import {
  generateTsVsCodeLaunch,
  generateTsConfig,
  generateTsgatewayPackageJson,
  generateTsGatewayTempalte,
  generateTsFederatedServerPackageJson,
  generateTsFederatedServerTemplate,
  generateCodeWorkspaceFile,
} from './exportFiles';
import { ApolloWorkbenchFile } from '../workbench/file-system/fileTypes';

export function createTypescriptTemplate(workbenchFile: ApolloWorkbenchFile) {
  let port = StateManager.settings_startingServerPort;
  const archive = create('zip', { zlib: { level: 9 } });

  const fileName = workbenchFile.graphName.replace(/[\/|\\:*?"<>]/g, ' ');
  archive.append(generateTsVsCodeLaunch('Gateway'), { name: 'launch.json' });
  archive.append(generateTsConfig(), { name: 'tsconfig.json' });
  archive.append(generateTsgatewayPackageJson(), { name: 'package.json' });
  archive.append(generateTsGatewayTempalte(), { name: 'index.ts' });

  for (var serviceName in workbenchFile.schemas) {
    let serviceFolder = `services/${serviceName}`;
    let serviceVsCodeFolder = `${serviceFolder}/.vscode`;
    let serviceSrcFolder = `${serviceFolder}/src`;

    archive.append(generateTsConfig(), {
      name: `${serviceFolder}/tsconfig.json`,
    });
    archive.append(generateTsFederatedServerPackageJson(serviceName), {
      name: `${serviceFolder}/package.json`,
    });
    archive.append(workbenchFile.schemas[serviceName].sdl, {
      name: `${serviceSrcFolder}/schema.graphql`,
    });
    archive.append(generateTsFederatedServerTemplate(port, serviceName), {
      name: `${serviceSrcFolder}/index.ts`,
    });
    archive.append(generateTsVsCodeLaunch(serviceName), {
      name: `${serviceVsCodeFolder}/launch.json`,
    });

    port++;
  }

  archive.append(
    generateCodeWorkspaceFile(Object.keys(workbenchFile.schemas)),
    { name: 'gateway.code-workspace' },
  );

  const destPath = resolve(
    StateManager.workspaceRoot ?? __dirname,
    `${fileName}-ts.zip`,
  );
  const output = createWriteStream(destPath);
  archive.pipe(output);
  archive.finalize();
}
