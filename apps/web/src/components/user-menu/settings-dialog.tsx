import { GearIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import {
  type Appearance,
  readStoredAppearance,
  shouldUseDarkAppearance,
  writeStoredAppearance,
} from '@/lib/appearance-storage';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface SettingsDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function SettingsDialog({ onOpenChange, open }: SettingsDialogProps) {
  const [appearance, setAppearance] =
    useState<Appearance>(readStoredAppearance);

  useEffect(() => {
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyAppearance = () => {
      document.documentElement.classList.toggle(
        'dark',
        shouldUseDarkAppearance(appearance, colorScheme.matches),
      );
    };

    applyAppearance();
    colorScheme.addEventListener('change', applyAppearance);
    return () => colorScheme.removeEventListener('change', applyAppearance);
  }, [appearance]);

  const handleAppearanceChange = (nextAppearance: Appearance) => {
    setAppearance(nextAppearance);
    writeStoredAppearance(nextAppearance);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(640px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[760px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[760px]">
        <DialogHeader className="flex h-16 shrink-0 justify-center border-b px-6">
          <DialogTitle className="text-lg font-semibold">Settings</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            aria-label="Settings sections"
            className="shrink-0 border-b bg-muted/30 p-2 sm:w-52 sm:border-r sm:border-b-0 sm:p-3"
          >
            <div
              aria-current="page"
              className="flex h-9 w-full items-center gap-2 rounded-lg bg-muted px-3 text-left text-sm font-medium text-foreground"
            >
              <GearIcon className="size-4" weight="fill" />
              General
            </div>
          </nav>

          <ScrollArea className="min-h-0 w-full flex-1">
            <section className="w-full px-5 py-6 sm:px-8 sm:py-8">
              <SettingsHeading
                description="Choose how ManyLatte looks and feels on this device."
                title="General"
              />

              <div className="mt-7 w-full divide-y">
                <SettingsRow
                  description="Use your device setting or choose a theme."
                  label="Appearance"
                >
                  <Select
                    onValueChange={(value) =>
                      handleAppearanceChange(value as Appearance)
                    }
                    value={appearance}
                  >
                    <SelectTrigger aria-label="Appearance" className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsRow>
              </div>
            </section>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SettingsHeadingProps {
  description: string;
  title: string;
}

function SettingsHeading({ description, title }: SettingsHeadingProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

interface SettingsRowProps {
  children: React.ReactNode;
  description: string;
  label: string;
}

function SettingsRow({ children, description, label }: SettingsRowProps) {
  return (
    <div className="flex w-full items-center justify-between gap-5 py-5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
