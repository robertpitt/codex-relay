import { Storage } from "../storage";

export const readBoard = (projectPath: string) =>
  Storage.use((storage) => storage.getBoard(projectPath));
