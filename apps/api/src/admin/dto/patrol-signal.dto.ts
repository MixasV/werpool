export interface PatrolSignalAdminDto {
  id: string;
  marketId: string;
  issuer: string;
  severity: string;
  code: string;
  weight: number;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
}
