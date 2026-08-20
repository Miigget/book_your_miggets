import { playerProfileHref } from "@/lib/profile-href";
import { cn } from "@/lib/utils";

interface Props {
  userId?: string | null;
  nickname: string | null;
  className?: string;
}

export function NicknameLink({ userId, nickname, className }: Props) {
  const label = nickname?.trim() ? nickname.trim() : "Unknown player";

  if (!userId) {
    return <span className={className}>{label}</span>;
  }

  return (
    <a
      href={playerProfileHref(userId)}
      className={cn("text-purple-300 transition-colors hover:text-purple-100 hover:underline", className)}
    >
      {label}
    </a>
  );
}
