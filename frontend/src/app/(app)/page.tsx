import { MessageSquare } from "lucide-react";

export default function AppHomePage() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-bg-panel">
        <MessageSquare className="h-9 w-9 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-medium text-foreground">Select a conversation</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        Choose a chat from the list, or start a new conversation to begin messaging.
      </p>
    </div>
  );
}
