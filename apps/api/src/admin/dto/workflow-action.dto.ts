export interface WorkflowActionAdminDto {
  id: string;
  marketId: string;
  marketSlug: string | null;
  marketTitle: string | null;
  type: string;
  status: string;
  description: string;
  triggersAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
