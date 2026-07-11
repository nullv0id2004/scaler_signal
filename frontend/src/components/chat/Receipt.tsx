import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageStatus } from "@/lib/types";

export function Receipt({ status }: { status: MessageStatus }) {
  switch (status) {
    case "sending":
      return <Clock className="h-3.5 w-3.5 text-white/60" />;
    case "failed":
      return <AlertCircle className="h-3.5 w-3.5 text-red-300" />;
    case "delivered":
      return <CheckCheck className="h-3.5 w-3.5 text-white/70" />;
    case "read":
      return <CheckCheck className={cn("h-3.5 w-3.5 text-sky-300")} />;
    case "sent":
    default:
      return <Check className="h-3.5 w-3.5 text-white/70" />;
  }
}
