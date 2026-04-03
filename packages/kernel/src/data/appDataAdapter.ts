import type { Asset, Generation, Project, StudioFile } from "@beomz-studio/contracts";

export interface ProjectSnapshot {
  project: Project;
  files: readonly StudioFile[];
  assets: readonly Asset[];
  generations: readonly Generation[];
}

export interface AppDataAdapter {
  listProjects(orgId: string): Promise<readonly Project[]>;
  getProject(projectId: string): Promise<Project | null>;
  getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null>;
  upsertFiles(projectId: string, files: readonly StudioFile[]): Promise<readonly StudioFile[]>;
  createGeneration(generation: Generation): Promise<Generation>;
  updateGeneration(generationId: string, patch: Partial<Generation>): Promise<Generation>;
  listAssets(projectId: string): Promise<readonly Asset[]>;
}

export function defineAppDataAdapter(adapter: AppDataAdapter): AppDataAdapter {
  return adapter;
}
