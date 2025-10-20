export interface CreateWorkflowActionDto {
  marketId: string;
  type: string;
  description: string;
  status?: string;
  triggersAt?: string | null;
  metadata?: Record<string, unknown>;
}
