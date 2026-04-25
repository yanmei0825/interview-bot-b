import { v4 as uuidv4 } from "uuid";
import { Company, Project, Language } from "./types";
import { getDb } from "./db";

export async function createCompany(name: string, id?: string): Promise<Company> {
  const company: Company = { id: id ?? uuidv4(), name, createdAt: Date.now() };
  await getDb().query(
    `INSERT INTO companies (id, name, "createdAt") VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [company.id, company.name, company.createdAt]
  );
  return company;
}

export async function getCompany(id: string): Promise<Company | undefined> {
  const result = await getDb().query(`SELECT * FROM companies WHERE id = $1`, [id]);
  return result.rows[0] as Company | undefined;
}

export async function listCompanies(): Promise<Company[]> {
  const result = await getDb().query(`SELECT * FROM companies ORDER BY "createdAt" DESC`);
  return result.rows as Company[];
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
  await getDb().query(
    `INSERT INTO projects (id, "companyId", name, description, "demographicsEnabled", "allowedLanguages", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       "demographicsEnabled" = EXCLUDED."demographicsEnabled",
       "allowedLanguages" = EXCLUDED."allowedLanguages"`,
    [
      project.id,
      project.companyId,
      project.name,
      project.description ?? null,
      project.demographicsEnabled,
      JSON.stringify(project.allowedLanguages),
      project.createdAt,
    ]
  );
  return project;
}

export async function getProject(id: string): Promise<Project | undefined> {
  const result = await getDb().query(`SELECT * FROM projects WHERE id = $1`, [id]);
  const row = result.rows[0] as any;
  if (!row) return undefined;
  return {
    ...row,
    allowedLanguages: JSON.parse(row.allowedLanguages as string),
  } as Project;
}

export async function listProjectsByCompany(companyId: string): Promise<Project[]> {
  const result = await getDb().query(
    `SELECT * FROM projects WHERE "companyId" = $1 ORDER BY "createdAt" DESC`,
    [companyId]
  );
  return result.rows.map((row: any) => ({
    ...row,
    allowedLanguages: JSON.parse(row.allowedLanguages as string),
  }));
}
