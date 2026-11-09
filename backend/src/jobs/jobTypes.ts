import type { AgentTask, AgentExecutionEvent } from "../../../shared/agentProgress.js";
export type AiJobStatus = "RUNNING" | "SUCCESS" | "FAILED" | "UNKNOWN ERROR";
export type AiJobTaskType = "custom" | "jira" | "architecture" | "library-skill" | "library-mcp";

export interface AiJobRecord {
  tasks?: AgentTask[];
  events?: AgentExecutionEvent[];
  id: string;
  taskType: AiJobTaskType;
  projectId: string;
  projectName: string;
  providerId: string;
  modelId: string;
  effort: string;
  branchName: string | null;
  jiraTicketKey: string | null;
  jiraTicketTitle: string;
  progressTodoId?: string | null;
  progressSourceFileLabel?: string | null;
  summary: string;
  inputMarkdown: string;
  status: AiJobStatus;
  outputMarkdown: string;
  executionOutput: string;
  errorReason: string | null;
  exitCode: number | null;
  createdAt: string;
  startedAt: string;
  updatedAt: string;
}

export interface CreateAiJobInput {
  taskType: AiJobTaskType;
  projectId: string;
  projectName: string;
  providerId: string;
  modelId: string;
  effort: string;
  branchName: string | null;
  jiraTicketKey: string | null;
  jiraTicketTitle: string;
  progressTodoId?: string | null;
  progressSourceFileLabel?: string | null;
  summary: string;
  inputMarkdown: string;
}

export interface UpdateAiJobInput {
  tasks?: AgentTask[];
  events?: AgentExecutionEvent[];
  status: AiJobStatus;
  outputMarkdown: string;
  executionOutput: string;
  errorReason: string | null;
  exitCode: number | null;
}
