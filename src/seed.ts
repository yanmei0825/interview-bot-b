import { createCompany, createProject, getProject } from "./store";

export const SEED_PROJECT_ID = "AI-Interview";
const SEED_COMPANY_ID = "default-company";

export async function seedDefaultProject(): Promise<void> {
  if (await getProject(SEED_PROJECT_ID)) return;

  await createCompany("Default Company", SEED_COMPANY_ID);
  await createProject(SEED_COMPANY_ID, "Default Interview Project", {
    id: SEED_PROJECT_ID,
    demographicsEnabled: false,
    allowedLanguages: ["ru", "en", "tr"],
  });

  console.log(`[seed] Default project ready  →  id: "${SEED_PROJECT_ID}"`);
}
