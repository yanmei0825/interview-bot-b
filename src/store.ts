import { v4 as uuidv4 } from "uuid";
import { Company, Project, Language } from "./types";
import { getDb } from "./db";

export async function createCompany(name: string, id?: string): Promise<Company> {
  const company: Company = { id: id ?? uuidv4(), name, createdAt: Date.now() };
  await getDb().execute({
    sql: "INSERT OR REPLACE INTO companies (id, name, createdAt) VALUES (?, ?, ?)",
    args: [company.id, company.name, company.createdAt],
  });
  return company;
}

export async function getCompany(id: string): Promise<Company | undefined> {
  const result = await getDb().execute({ sql: "SELECT * FROM companies WHERE id = ?", args: [id] });
  return result.rows[0] as unknown as Company | undefined;
}

export async function listCompanies(): Promise<Company[]> {
  const result = await getDb().execute("SELECT * FROM companies ORDER BY createdAt DESC");
  return result.rows as unknown as Company[];
}

export async function createProject(
  companyId: string,
  name: string,
  opts: {
    id?: string;
    description?: string;
    demographicsEnabled?: boolean;
    allowedLanguages?: Language[];
  } = {}
): Promise<Project> {
  const project: Project = {
    id: opts.id ?? uuidv4(),
    companyId,
    name,
    demographicsEnabled: opts.demographicsEnabled ?? false,
    allowedLanguages: opts.allowedLanguages ?? ["ru", "en", "tr"],
    createdAt: Date.now(),
    ...(opts.description !== undefined && { description: opts.description }),
  };
  await getDb().execute({
    sql: `INSERT OR REPLACE INTO projects (id, companyId, name, description, demographicsEnabled, allowedLanguages, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      project.id,
      project.companyId,
      project.name,
      project.description ?? null,
      project.demographicsEnabled ? 1 : 0,
      JSON.stringify(project.allowedLanguages),
      project.createdAt,
    ],
  });
  return project;
}

export async function getProject(id: string): Promise<Project | undefined> {
  const result = await getDb().execute({ sql: "SELECT * FROM projects WHERE id = ?", args: [id] });
  const row = result.rows[0] as any;
  if (!row) return undefined;
  return {
    ...row,
    demographicsEnabled: row.demographicsEnabled === 1,
    allowedLanguages: JSON.parse(row.allowedLanguages as string),
  } as Project;
}

export async function listProjectsByCompany(companyId: string): Promise<Project[]> {
  const result = await getDb().execute({
    sql: "SELECT * FROM projects WHERE companyId = ? ORDER BY createdAt DESC",
    args: [companyId],
  });
  return (result.rows as any[]).map((row) => ({
    ...row,
    demographicsEnabled: row.demographicsEnabled === 1,
    allowedLanguages: JSON.parse(row.allowedLanguages as string),
  }));
}
