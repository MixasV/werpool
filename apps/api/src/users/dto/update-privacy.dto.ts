export interface UpdatePrivacySettingsDto {
  profileVisibility?: "public" | "private" | "network";
  tradeHistoryVisibility?: "private" | "network" | "public";
}
