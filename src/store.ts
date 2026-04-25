import { v4 as uuidv4 } from "uuid";
import { Company, Project, Language } from "./types";
import db from "./db";

export function createCompany(name: string, id?: string): Company {
  const company: Company = { id: id ?? uuidv4(), name, createdAt: Date.now() };
  db.prepare("INSERT OR REPLACE INTO companies (id, name, createdAt) VALUES (?, ?, ?)")
    .run(company.id, company.name, company.createdAt);
  return company;
}

export function getCompany(id: string): Company | undefined {
  return db.prepare("SELECT * FROM companies WHERE id = ?").get(id) as Company | undefined;
}

export function listCompanies(): Company[] {
  return db.prepare("SELECT * FROM companies ORDER BY createdAt DESC").all() as Company[];
}

export function createProject(
  companyId: string,
  name: string,
  opts: {
    id?: string;
    description?: string;
    demographicsEnabled?: boolean;
    allowedLanguages?: Language[];
  } = {}
): Project {
  const project: Project = {
    id: opts.id ?? uuidv4(),
    companyId,
    name,
    demographicsEnabled: opts.demographicsEnabled ?? false,
    allowedLanguages: opts.allowedLanguages ?? ["ru", "en", "tr"],
    createdAt: Date.now(),
    ...(opts.description !== undefined && { description: opts.description }),
  };
  db.prepare(`
    INSERT OR REPLACE INTO projects (id, companyId, name, description, demographicsEnabled, allowedLanguages, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    project.id,
    project.companyId,
    project.name,
    project.description ?? null,
    project.demographicsEnabled ? 1 : 0,
    JSON.stringify(project.allowedLanguages),
    project.createdAt
  );
  return project;
}

export function getProject(id: string): Project | undefined {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
  if (!row) return undefined;
  return {
    ...row,
    demographicsEnabled: row.demographicsEnabled === 1,
    allowedLanguages: JSON.parse(row.allowedLanguages),
  } as Project;
}

export function listProjectsByCompany(companyId: string): Project[] {
  const rows = db.prepare("SELECT * FROM projects WHERE companyId = ? ORDER BY createdAt DESC").all(companyId) as any[];
  return rows.map(row => ({
    ...row,
    demographicsEnabled: row.demographicsEnabled === 1,
    allowedLanguages: JSON.parse(row.allowedLanguages),
  }));
}
