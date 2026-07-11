"use client";

import * as React from "react";
import { Moon, Bell, Lock, Phone, BookImage, Smartphone, User as UserIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/avatar";
import { useUiStore } from "@/lib/store/ui";
import { useAuthStore } from "@/lib/store/auth";

function Row({
  icon,
  title,
  description,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-active text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
      </div>
      {right}
    </div>
  );
}

export function SettingsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const user = useAuthStore((s) => s.user);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your profile, appearance, and notifications.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg bg-bg-panel p-3">
          <UserAvatar id={user?.id ?? 0} name={user?.display_name ?? "?"} src={user?.avatar_url} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{user?.display_name}</div>
            <div className="truncate text-xs text-muted-foreground">@{user?.username}</div>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col divide-y divide-border">
          <Row
            icon={<Moon className="h-4 w-4" />}
            title="Dark mode"
            description="Toggle between Signal's dark and light appearance"
            right={<Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />}
          />
          <Row
            icon={<Bell className="h-4 w-4" />}
            title="Notifications"
            description="Coming soon"
          />
          <Row icon={<Lock className="h-4 w-4" />} title="Privacy" description="Coming soon" />
          <Row icon={<UserIcon className="h-4 w-4" />} title="Profile" description="Coming soon" />
          <Row icon={<Phone className="h-4 w-4" />} title="Calls" description="Coming soon" />
          <Row icon={<BookImage className="h-4 w-4" />} title="Stories" description="Coming soon" />
          <Row icon={<Smartphone className="h-4 w-4" />} title="Linked devices" description="Coming soon" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
