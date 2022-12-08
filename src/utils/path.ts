import { Uri } from "vscode";
import { Utils } from "vscode-uri";

export function getFileName(filePath: string){
  return Utils.basename(Uri.parse(filePath)).split('.')[0];
}