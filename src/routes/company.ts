import { Router, Request, Response } from "express";
import { createCompany, getCompany, listCompanies, createProject, getProject, listProjectsByCompany } from "../store";
import { Language } from "../types";
import { generateProjectReport, generateCompanyReport, generateComparisonAnalysis } from "../analytics";
import { getAllSessionsByProject } from "../session";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name) return res.status(400).json({ error: "name is required" });
  const company = await createCompany(name);
  return res.status(201).json(company);
});

router.get("/", async (_req: Request, res: Response) => {
  return res.json(await listCompanies());
});

router.get("/:id", async (req: Request, res: Response) => {
  const company = await getCompany(String(req.params["id"]));
  if (!company) return res.status(404).json({ error: "Company not found" });
  return res.json(company);
});

router.post("/:id/projects", async (req: Request, res: Response) => {
  const companyId = String(req.params["id"]);
  const company = await getCompany(companyId);
  if (!company) return res.status(404).json({ error: "Company not found" });

  const { name, description, demographicsEnabled, allowedLanguages } = req.body as {
    name?: string;
    description?: string;
    demographicsEnabled?: boolean;
    allowedLanguages?: Language[];
  };
  if (!name) return res.status(400).json({ error: "name is required" });

  const project = await createProject(companyId, name, {
    ...(description !== undefined && { description }),
    ...(demographicsEnabled !== undefined && { demographicsEnabled }),
    ...(allowedLanguages !== undefined && { allowedLanguages }),
  });
  return res.status(201).json(project);
});

router.get("/:id/projects", async (req: Request, res: Response) => {
  const companyId = String(req.params["id"]);
  if (!await getCompany(companyId)) return res.status(404).json({ error: "Company not found" });
  return res.json(await listProjectsByCompany(companyId));
});

router.get("/:id/projects/:projectId", async (req: Request, res: Response) => {
  const project = await getProject(String(req.params["projectId"]));
  if (!project || project.companyId !== String(req.params["id"])) {
    return res.status(404).json({ error: "Project not found" });
  }
  return res.json(project);
});

router.get("/:id/projects/:projectId/report", async (req: Request, res: Response) => {
  const projectId = String(req.params["projectId"]);
  const project = await getProject(projectId);
  if (!project || project.companyId !== String(req.params["id"])) {
    return res.status(404).json({ error: "Project not found" });
  }
  return res.json(await generateProjectReport(projectId));
});

router.get("/:id/projects/:projectId/sessions", async (req: Request, res: Response) => {
  const projectId = String(req.params["projectId"]);
  const project = await getProject(projectId);
  if (!project || project.companyId !== String(req.params["id"])) {
    return res.status(404).json({ error: "Project not found" });
  }
  const sessions = (await getAllSessionsByProject(projectId)).map((s) => ({
    token: s.token, language: s.language, finished: s.finished,
    turnCount: s.turnCount, demographics: s.demographics,
    createdAt: s.createdAt, lastActivityAt: s.lastActivityAt,
  }));
  return res.json(sessions);
});

router.get("/:id/projects/:projectId/comparison", async (req: Request, res: Response) => {
  const projectId = String(req.params["projectId"]);
  const project = await getProject(projectId);
  if (!project || project.companyId !== String(req.params["id"])) {
    return res.status(404).json({ error: "Project not found" });
  }
  return res.json(await generateComparisonAnalysis(projectId));
});

router.get("/:id/report", async (req: Request, res: Response) => {
  const companyId = String(req.params["id"]);
  const company = await getCompany(companyId);
  if (!company) return res.status(404).json({ error: "Company not found" });
  return res.json(await generateCompanyReport(companyId));
});

export default router;
