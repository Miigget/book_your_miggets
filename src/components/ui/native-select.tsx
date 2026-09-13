import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface NativeSelectProps extends ComponentProps<"select"> {
  wrapperClassName?: string;
}

export function NativeSelect({ className, wrapperClassName, ...props }: NativeSelectProps) {
  return (
    <div className={cn("relative w-full", wrapperClassName)}>
      <select className={cn("peer appearance-none", className, "pr-9")} {...props} />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-white transition-transform peer-[:open]:rotate-180"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
