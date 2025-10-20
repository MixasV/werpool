export interface UpdateUserProfileDto {
  label?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  marketingOptIn?: boolean;
  email?: string | null;
}
