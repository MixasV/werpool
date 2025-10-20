export interface UpdateWorkflowActionDto {
  description?: string;
  status?: string;
  triggersAt?: string | null;
  metadata?: Record<string, unknown>;
}
