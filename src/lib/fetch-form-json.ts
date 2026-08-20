export interface FormJsonMeta {
  error?: string;
  signIn?: string;
  redirect?: string;
  ok?: boolean;
  status?: "pending" | "confirmed" | "denied";
  participantId?: string;
  nickname?: string;
  comment?: {
    id: string;
    runId: string;
    authorId: string;
    nickname: string | null;
    body: string;
    createdAt: string;
    likeCount: number;
    likedByMe: boolean;
  };
}

export async function fetchFormJson(form: HTMLFormElement): Promise<{ response: Response; data: FormJsonMeta }> {
  const response = await fetch(form.action, {
    method: "POST",
    body: new FormData(form),
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const data = (await response.json().catch(() => ({}))) as FormJsonMeta;
  return { response, data };
}

export function reloadKeepingScroll(): void {
  sessionStorage.setItem(`bym:scroll:${window.location.pathname}`, String(window.scrollY));
  window.location.reload();
}
