import { DimensionKey } from "./types";
import { DIMENSION_ORDER, getDimension } from "./dimensions";
import { getAllSessionsByProject, getEventsByProject } from "./session";
import { listProjectsByCompany, getCompany } from "./store";

export interface DimensionReport {
  key: DimensionKey;
  name: string;
  coveredCount: number;
  totalRespondents: number;
  coveragePercent: number;
  avgTurns: number;
  avgDepthScore: number;
  topSignals: string[];
  sentimentBreakdown: { positive: number; negative: number; neutral: number };
  burnoutCount: number;
  painLockRedirectCount: number;
}

export interface ProjectReport {
  projectId: string;
  totalSessions: number;
  finishedSessions: number;
  completionRate: number;
  overallDepthScore: number;
  dimensions: DimensionReport[];
  languageBreakdown: Record<string, number>;
  generatedAt: number;
}

function calcDepthScore(turnCount: number, maxTurns: number, signalCount: number): number {
  const turnScore = Math.min(turnCount / Math.max(maxTurns, 1), 1) * 50;
  const signalScore = Math.min(signalCount / 5, 1) * 50;
  return Math.round(turnScore + signalScore);
}

export async function generateProjectReport(projectId: string): Promise<ProjectReport> {
  const sessions = await getAllSessionsByProject(projectId);
  const finished = sessions.filter((s) => s.finished);
  const total = sessions.length;
  const allEvents = await getEventsByProject(projectId);

  const languageBreakdown: Record<string, number> = {};
  for (const s of sessions) {
    if (s.language) {
      languageBreakdown[s.language] = (languageBreakdown[s.language] ?? 0) + 1;
    }
  }

  let totalDepthSum = 0;
  let totalDepthCount = 0;

  const dimensions: DimensionReport[] = DIMENSION_ORDER.map((key) => {
    const def = getDimension(key);
    const relevant = sessions.filter((s) => s.coverage[key] !== undefined);
    const coveredCount = relevant.filter((s) => s.coverage[key]!.covered).length;
    const totalTurns = relevant.reduce((sum, s) => sum + s.coverage[key]!.turnCount, 0);
    const avgTurns = relevant.length > 0 ? totalTurns / relevant.length : 0;

    const depthScores = relevant.map((s) =>
      calcDepthScore(s.coverage[key]!.turnCount, def.maxTurns, s.coverage[key]!.signals.length)
    );
    const avgDepthScore =
      depthScores.length > 0
        ? Math.round(depthScores.reduce((a, b) => a + b, 0) / depthScores.length)
        : 0;

    totalDepthSum += avgDepthScore * relevant.length;
    totalDepthCount += relevant.length;

    const signalFreq: Record<string, number> = {};
    for (const s of relevant) {
      for (const sig of s.coverage[key]!.signals) {
        signalFreq[sig] = (signalFreq[sig] ?? 0) + 1;
      }
    }
    const topSignals = Object.entries(signalFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([sig]) => sig);

    const sentimentBreakdown = { positive: 0, negative: 0, neutral: 0 };
    let burnoutCount = 0;
    let painLockRedirectCount = 0;
    for (const ev of allEvents) {
      if (ev.dimension === key) {
        if (ev.event === "sentiment_positive") sentimentBreakdown.positive++;
        else if (ev.event === "sentiment_negative") sentimentBreakdown.negative++;
        else if (ev.event === "sentiment_neutral") sentimentBreakdown.neutral++;
        else if (ev.event === "burnout_detected") burnoutCount++;
        else if (ev.event === "pain_lock_redirect") painLockRedirectCount++;
      }
    }

    return {
      key,
      name: def.name.en,
      coveredCount,
      totalRespondents: total,
      coveragePercent: total > 0 ? Math.round((coveredCount / total) * 100) : 0,
      avgTurns: Math.round(avgTurns * 10) / 10,
      avgDepthScore,
      topSignals,
      sentimentBreakdown,
      burnoutCount,
      painLockRedirectCount,
    };
  });

  return {
    projectId,
    totalSessions: total,
    finishedSessions: finished.length,
    completionRate: total > 0 ? Math.round((finished.length / total) * 100) : 0,
    overallDepthScore: totalDepthCount > 0 ? Math.round(totalDepthSum / totalDepthCount) : 0,
    dimensions,
    languageBreakdown,
    generatedAt: Date.now(),
  };
}

export interface CompanyDimensionAnalysis {
  key: DimensionKey;
  name: string;
  avgCoveragePercent: number;
  avgDepthScore: number;
  totalRespondents: number;
  topSignals: string[];
  sentimentTrend: "positive" | "negative" | "neutral";
  riskLevel: "low" | "medium" | "high";
}

export interface CompanyReport {
  companyId: string;
  companyName: string;
  totalProjects: number;
  totalSessions: number;
  finishedSessions: number;
  overallCompletionRate: number;
  overallDepthScore: number;
  dimensions: CompanyDimensionAnalysis[];
  projectBreakdown: Array<{
    projectId: string;
    projectName: string;
    sessions: number;
    completionRate: number;
    depthScore: number;
  }>;
  keyInsights: string[];
  generatedAt: number;
}

export async function generateCompanyReport(companyId: string): Promise<CompanyReport> {
  const [projects, company] = await Promise.all([
    listProjectsByCompany(companyId),
    getCompany(companyId),
  ]);

  if (projects.length === 0) {
    return {
      companyId, companyName: company?.name ?? "", totalProjects: 0, totalSessions: 0,
      finishedSessions: 0, overallCompletionRate: 0, overallDepthScore: 0,
      dimensions: [], projectBreakdown: [], keyInsights: [], generatedAt: Date.now(),
    };
  }

  const projectReports = await Promise.all(
    projects.map(async (p) => ({ project: p, report: await generateProjectReport(p.id) }))
  );

  let totalSessions = 0, totalFinished = 0, totalDepthSum = 0, depthCount = 0;
  for (const { report } of projectReports) {
    totalSessions += report.totalSessions;
    totalFinished += report.finishedSessions;
    totalDepthSum += report.overallDepthScore * report.finishedSessions;
    depthCount += report.finishedSessions;
  }

  const dimensionMap = {} as Record<DimensionKey, CompanyDimensionAnalysis>;
  for (const key of DIMENSION_ORDER) {
    const def = getDimension(key);
    let totalCoverage = 0, totalDepth = 0, projectCount = 0, totalRespondents = 0;
    const allSignals: Record<string, number> = {};
    const sentiments = { positive: 0, negative: 0, neutral: 0 };

    for (const { report } of projectReports) {
      const dimReport = report.dimensions.find((d) => d.key === key);
      if (dimReport) {
        totalCoverage += dimReport.coveragePercent;
        totalDepth += dimReport.avgDepthScore;
        projectCount++;
        totalRespondents += dimReport.totalRespondents;
        for (const sig of dimReport.topSignals) allSignals[sig] = (allSignals[sig] ?? 0) + 1;
        sentiments.positive += dimReport.sentimentBreakdown.positive;
        sentiments.negative += dimReport.sentimentBreakdown.negative;
        sentiments.neutral += dimReport.sentimentBreakdown.neutral;
      }
    }

    const avgCoveragePercent = projectCount > 0 ? Math.round(totalCoverage / projectCount) : 0;
    const avgDepthScore = projectCount > 0 ? Math.round(totalDepth / projectCount) : 0;
    const topSignals = Object.entries(allSignals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([sig]) => sig);

    const maxSentiment = Math.max(sentiments.positive, sentiments.negative, sentiments.neutral);
    let sentimentTrend: "positive" | "negative" | "neutral" = "neutral";
    if (sentiments.positive === maxSentiment && sentiments.positive > 0) sentimentTrend = "positive";
    else if (sentiments.negative === maxSentiment && sentiments.negative > 0) sentimentTrend = "negative";

    let riskLevel: "low" | "medium" | "high" = "low";
    if (avgCoveragePercent < 50 || (sentimentTrend === "negative" && avgDepthScore < 40)) riskLevel = "high";
    else if (avgCoveragePercent < 70 || (sentimentTrend === "negative" && avgDepthScore < 60)) riskLevel = "medium";

    dimensionMap[key] = { key, name: def.name.en, avgCoveragePercent, avgDepthScore, totalRespondents, topSignals, sentimentTrend, riskLevel };
  }

  const projectBreakdown = projectReports.map(({ project, report }) => ({
    projectId: project.id, projectName: project.name,
    sessions: report.totalSessions, completionRate: report.completionRate, depthScore: report.overallDepthScore,
  }));

  const overallDepthScore = depthCount > 0 ? Math.round(totalDepthSum / depthCount) : 0;
  const keyInsights = generateKeyInsights(dimensionMap, projectBreakdown, overallDepthScore);

  return {
    companyId,
    companyName: company?.name ?? "",
    totalProjects: projects.length,
    totalSessions,
    finishedSessions: totalFinished,
    overallCompletionRate: totalSessions > 0 ? Math.round((totalFinished / totalSessions) * 100) : 0,
    overallDepthScore,
    dimensions: DIMENSION_ORDER.map((key) => dimensionMap[key]),
    projectBreakdown,
    keyInsights,
    generatedAt: Date.now(),
  };
}

function generateKeyInsights(
  dimensions: Record<DimensionKey, CompanyDimensionAnalysis>,
  projects: Array<{ projectName: string; completionRate: number; depthScore: number }>,
  overallDepthScore: number
): string[] {
  const insights: string[] = [];
  const highRiskDims = Object.values(dimensions).filter((d) => d.riskLevel === "high");
  if (highRiskDims.length > 0) insights.push(`⚠️ High-risk areas: ${highRiskDims.map((d) => d.name).join(", ")}. Recommend immediate attention.`);
  const strongDims = Object.values(dimensions).filter((d) => d.avgDepthScore >= 70 && d.avgCoveragePercent >= 80);
  if (strongDims.length > 0) insights.push(`✓ Strong areas: ${strongDims.map((d) => d.name).join(", ")}. Maintain current practices.`);
  const negativeCount = Object.values(dimensions).filter((d) => d.sentimentTrend === "negative").length;
  if (negativeCount >= 4) insights.push(`⚠️ Negative sentiment in ${negativeCount} dimensions. Consider engagement initiatives.`);
  const lowCoverage = Object.values(dimensions).filter((d) => d.avgCoveragePercent < 50);
  if (lowCoverage.length > 0) insights.push(`📊 Coverage gaps in: ${lowCoverage.map((d) => d.name).join(", ")}.`);
  const lowProjects = projects.filter((p) => p.completionRate < 50);
  if (lowProjects.length > 0) insights.push(`📉 ${lowProjects.length} project(s) have low completion rates.`);
  if (overallDepthScore >= 70) insights.push(`✓ Overall depth score is strong (${overallDepthScore}/100).`);
  else if (overallDepthScore < 40) insights.push(`⚠️ Overall depth score is low (${overallDepthScore}/100).`);
  return insights.slice(0, 5);
}

export interface InterviewComparison {
  token: string;
  language: string;
  demographics: Record<string, any> | null;
  turnCount: number;
  questionCount: number;
  overallDepthScore: number;
  dimensions: Array<{
    key: DimensionKey;
    name: string;
    turnCount: number;
    depthScore: number;
    signals: string[];
    sentiment: "positive" | "negative" | "neutral";
  }>;
}

export interface ComparisonAnalysis {
  projectId: string;
  projectName: string;
  totalInterviews: number;
  interviews: InterviewComparison[];
  aggregatedMetrics: { avgTurns: number; avgDepthScore: number; avgQuestionsPerInterview: number };
  dimensionComparison: Array<{
    key: DimensionKey; name: string;
    avgDepthScore: number; minDepthScore: number; maxDepthScore: number;
    depthVariance: number; avgTurns: number; topSignals: string[];
    sentimentDistribution: { positive: number; negative: number; neutral: number };
  }>;
  respondentProfiles: Array<{
    token: string; demographics: Record<string, any> | null;
    strongDimensions: string[]; weakDimensions: string[]; overallScore: number;
  }>;
  patterns: {
    consistentStrengths: string[]; consistentWeaknesses: string[];
    highVarianceDimensions: string[]; sentimentPatterns: string;
  };
  generatedAt: number;
}

export async function generateComparisonAnalysis(projectId: string): Promise<ComparisonAnalysis> {
  const allSessions = await getAllSessionsByProject(projectId);
  const sessions = allSessions.filter((s) => s.finished);

  if (sessions.length === 0) {
    return {
      projectId, projectName: "", totalInterviews: 0, interviews: [],
      aggregatedMetrics: { avgTurns: 0, avgDepthScore: 0, avgQuestionsPerInterview: 0 },
      dimensionComparison: [], respondentProfiles: [],
      patterns: { consistentStrengths: [], consistentWeaknesses: [], highVarianceDimensions: [], sentimentPatterns: "No data" },
      generatedAt: Date.now(),
    };
  }

  const interviews: InterviewComparison[] = sessions.map((session) => {
    let sessionDepthSum = 0, sessionDepthCount = 0;
    const positiveKeywords = ["good", "great", "proud", "happy", "love", "trust", "support"];
    const negativeKeywords = ["bad", "frustrated", "stressed", "hate", "ignored", "stuck"];

    const dimensions = DIMENSION_ORDER.map((key) => {
      const def = getDimension(key);
      const cov = session.coverage[key];
      const depthScore = calcDepthScore(cov.turnCount, def.maxTurns, cov.signals.length);
      sessionDepthSum += depthScore;
      sessionDepthCount++;

      const userMessages = session.history.filter((m) => m.role === "user").map((m) => m.content.toLowerCase());
      const posCount = userMessages.filter((m) => positiveKeywords.some((k) => m.includes(k))).length;
      const negCount = userMessages.filter((m) => negativeKeywords.some((k) => m.includes(k))).length;
      const sentiment: "positive" | "negative" | "neutral" = posCount > negCount ? "positive" : negCount > posCount ? "negative" : "neutral";

      return { key, name: def.name.en, turnCount: cov.turnCount, depthScore, signals: cov.signals, sentiment };
    });

    return {
      token: session.token, language: session.language || "en",
      demographics: session.demographics, turnCount: session.turnCount,
      questionCount: session.questionCount,
      overallDepthScore: sessionDepthCount > 0 ? Math.round(sessionDepthSum / sessionDepthCount) : 0,
      dimensions,
    };
  });

  const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

  const dimensionComparison = DIMENSION_ORDER.map((key) => {
    const def = getDimension(key);
    const depthScores = interviews.map((i) => i.dimensions.find((d) => d.key === key)?.depthScore || 0);
    const turnCounts = interviews.map((i) => i.dimensions.find((d) => d.key === key)?.turnCount || 0);
    const allSignals: Record<string, number> = {};
    for (const interview of interviews) {
      for (const sig of interview.dimensions.find((d) => d.key === key)?.signals ?? []) {
        allSignals[sig] = (allSignals[sig] ?? 0) + 1;
      }
    }
    const sentiments = interviews.map((i) => i.dimensions.find((d) => d.key === key)?.sentiment || "neutral");
    return {
      key, name: def.name.en,
      avgDepthScore: Math.round(avg(depthScores)),
      minDepthScore: Math.min(...depthScores),
      maxDepthScore: Math.max(...depthScores),
      depthVariance: Math.max(...depthScores) - Math.min(...depthScores),
      avgTurns: avg(turnCounts),
      topSignals: Object.entries(allSignals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s),
      sentimentDistribution: {
        positive: sentiments.filter((s) => s === "positive").length,
        negative: sentiments.filter((s) => s === "negative").length,
        neutral: sentiments.filter((s) => s === "neutral").length,
      },
    };
  });

  const respondentProfiles = interviews.map((i) => ({
    token: i.token, demographics: i.demographics,
    strongDimensions: i.dimensions.filter((d) => d.depthScore >= 70).map((d) => d.name),
    weakDimensions: i.dimensions.filter((d) => d.depthScore < 50).map((d) => d.name),
    overallScore: i.overallDepthScore,
  }));

  const dimensionStrengths: Record<string, number> = {};
  const dimensionWeaknesses: Record<string, number> = {};
  const dimensionVariances: Record<string, number> = {};
  for (const dim of dimensionComparison) {
    const strongCount = interviews.filter((i) => (i.dimensions.find((d) => d.key === dim.key)?.depthScore ?? 0) >= 70).length;
    const weakCount = interviews.filter((i) => (i.dimensions.find((d) => d.key === dim.key)?.depthScore ?? 0) < 50).length;
    if (strongCount >= interviews.length * 0.7) dimensionStrengths[dim.name] = strongCount;
    if (weakCount >= interviews.length * 0.5) dimensionWeaknesses[dim.name] = weakCount;
    if (dim.depthVariance >= 40) dimensionVariances[dim.name] = dim.depthVariance;
  }

  const totalPos = interviews.reduce((s, i) => s + i.dimensions.filter((d) => d.sentiment === "positive").length, 0);
  const totalNeg = interviews.reduce((s, i) => s + i.dimensions.filter((d) => d.sentiment === "negative").length, 0);
  const totalNeu = interviews.reduce((s, i) => s + i.dimensions.filter((d) => d.sentiment === "neutral").length, 0);
  const totalSent = totalPos + totalNeg + totalNeu;
  let sentimentPatterns = "Balanced";
  if (totalPos > totalSent * 0.6) sentimentPatterns = "Predominantly Positive";
  else if (totalNeg > totalSent * 0.6) sentimentPatterns = "Predominantly Negative";
  else if (totalNeu > totalSent * 0.6) sentimentPatterns = "Predominantly Neutral";

  return {
    projectId, projectName: sessions[0]?.projectId || "",
    totalInterviews: interviews.length, interviews,
    aggregatedMetrics: {
      avgTurns: avg(interviews.map((i) => i.turnCount)),
      avgDepthScore: Math.round(avg(interviews.map((i) => i.overallDepthScore))),
      avgQuestionsPerInterview: avg(interviews.map((i) => i.questionCount)),
    },
    dimensionComparison, respondentProfiles,
    patterns: {
      consistentStrengths: Object.entries(dimensionStrengths).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n),
      consistentWeaknesses: Object.entries(dimensionWeaknesses).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n),
      highVarianceDimensions: Object.entries(dimensionVariances).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n),
      sentimentPatterns,
    },
    generatedAt: Date.now(),
  };
}
