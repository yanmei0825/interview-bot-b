import { Router, Request, Response } from "express";
import { createCompany, getCompany, listCompanies, createProject, getProject, listProjectsByCompany } from "../store";
import { Language } from "../types";
import { generateProjectReport, generateCompanyReport, generateComparisonAnalysis } from "../analytics";
import { getAllSessionsByProject } from "../session";

const router = Router();

router.post("/", (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name) return res.status(400).json({ error: "name is required" });

  const company = createCompany(name);
  return res.status(201).json(company);
});

router.get("/", (_req: Request, res: Response) => {
  return res.json(listCompanies());
});

router.get("/:id", (req: Request, res: Response) => {
  const company = getCompany(String(req.params["id"]));
  if (!company) return res.status(404).json({ error: "Company not found" });
  return res.json(company);
});

router.post("/:id/projects", (req: Request, res: Response) => {
  const companyId = String(req.params["id"]);
  const company = getCompany(companyId);
  if (!company) return res.status(404).json({ error: "Company not found" });

  const { name, description, demographicsEnabled, allowedLanguages } = req.body as {
    name?: string;
    description?: string;
    demographicsEnabled?: boolean;
    allowedLanguages?: Language[];
  };

  if (!name) return res.status(400).json({ error: "name is required" });

  const project = createProject(companyId, name, {
    ...(description !== undefined && { description }),
    ...(demographicsEnabled !== undefined && { demographicsEnabled }),
    ...(allowedLanguages !== undefined && { allowedLanguages }),
  });

  return res.status(201).json(project);
});

router.get("/:id/projects", (req: Request, res: Response) => {
  const companyId = String(req.params["id"]);
  if (!getCompany(companyId)) return res.status(404).json({ error: "Company not found" });

  return res.json(listProjectsByCompany(companyId));
});

router.get("/:id/projects/:projectId", (req: Request, res: Response) => {
  const project = getProject(String(req.params["projectId"]));
  if (!project || project.companyId !== String(req.params["id"])) {
    return res.status(404).json({ error: "Project not found" });
  }
  return res.json(project);
});

router.get("/:id/projects/:projectId/report", (req: Request, res: Response) => {
  const projectId = String(req.params["projectId"]);
  const project = getProject(projectId);
  if (!project || project.companyId !== String(req.params["id"])) {
    return res.status(404).json({ error: "Project not found" });
  }

  const report = generateProjectReport(projectId);
  return res.json(report);
});

router.get("/:id/projects/:projectId/sessions", (req: Request, res: Response) => {
  const projectId = String(req.params["projectId"]);
  const project = getProject(projectId);
  if (!project || project.companyId !== String(req.params["id"])) {
    return res.status(404).json({ error: "Project not found" });
  }

  const sessions = getAllSessionsByProject(projectId).map((s) => ({
    token: s.token,
    language: s.language,
    finished: s.finished,
    turnCount: s.turnCount,
    demographics: s.demographics,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt,
  }));

  return res.json(sessions);
});


router.get("/:id/projects/:projectId/comparison", (req: Request, res: Response) => {
  const projectId = String(req.params["projectId"]);
  const project = getProject(projectId);
  if (!project || project.companyId !== String(req.params["id"])) {
    return res.status(404).json({ error: "Project not found" });
  }

  const analysis = generateComparisonAnalysis(projectId);
  return res.json(analysis);
});

router.get("/:id/report", (req: Request, res: Response) => {
  const companyId = String(req.params["id"]);
  const company = getCompany(companyId);
  if (!company) return res.status(404).json({ error: "Company not found" });

  const report = generateCompanyReport(companyId);
  return res.json(report);
});

export default router;
