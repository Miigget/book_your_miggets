import { useEffect, useState } from "react";

const SHOW_MS = 5000;

interface Props {
  count: number;
  href: string;
}

export default function InboxToast({ count, href }: Props) {
  const [open, setOpen] = useState(count > 0);

  useEffect(() => {
    if (count < 1) return;
    const hide = window.setTimeout(() => {
      setOpen(false);
    }, SHOW_MS);
    return () => {
      window.clearTimeout(hide);
    };
  }, [count]);

  if (!open || count < 1) return null;

  const label = count === 1 ? "You have 1 pending invite" : `You have ${count} pending invites`;

  return (
    <div
      role="status"
      className="absolute top-full right-0 z-50 mt-2 w-56 rounded-xl border border-white/15 bg-slate-950/95 p-3 text-left shadow-lg backdrop-blur-xl"
    >
      <span
        className="absolute -top-1.5 right-5 h-3 w-3 rotate-45 border-t border-l border-white/15 bg-slate-950/95"
        aria-hidden="true"
      />
      <p className="text-sm text-white">{label}</p>
      <a href={href} className="mt-1 inline-block text-xs text-purple-300 hover:text-purple-100 hover:underline">
        View on your profile
      </a>
    </div>
  );
}
