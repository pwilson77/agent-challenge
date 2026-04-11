import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        neutral: "border-slate-600 bg-slate-900 text-slate-200",
        buy: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
        sell: "border-rose-500/50 bg-rose-500/15 text-rose-300",
        monitor: "border-amber-500/50 bg-amber-500/15 text-amber-300",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
