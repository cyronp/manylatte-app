import { CursorIcon, GearIcon, GridFourIcon } from '@phosphor-icons/react';
import { useState, type ComponentType } from 'react';

import { useAppearance } from '@/components/appearance-provider';
import { useUserPreferences } from '@/components/user-preferences-provider';
import type { Appearance } from '@/lib/appearance-storage';
import type { MouseWheelBehavior } from '@/lib/user-preferences-storage';
import { cn } from '@/lib/utils';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';

interface SettingsDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function SettingsDialog({ onOpenChange, open }: SettingsDialogProps) {
  const { appearance, setAppearance } = useAppearance();
  const {
    mouseWheelBehavior,
    remoteCursorOpacity,
    setMouseWheelBehavior,
    setRemoteCursorOpacity,
    setShowGrid,
    setSnapToGrid,
    showGrid,
    snapToGrid,
  } = useUserPreferences();
  const [activeSection, setActiveSection] =
    useState<SettingsSection>('general');

  const handleAppearanceChange = (nextAppearance: Appearance) => {
    setAppearance(nextAppearance);
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
            className="flex shrink-0 gap-1 overflow-x-auto border-b bg-muted/30 p-2 sm:w-52 sm:flex-col sm:border-r sm:border-b-0 sm:p-3"
          >
            {SETTINGS_SECTIONS.map((section) => (
              <button
                aria-current={activeSection === section.id ? 'page' : undefined}
                className={cn(
                  'flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-full',
                  activeSection === section.id &&
                    'bg-muted text-foreground hover:bg-muted',
                )}
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                type="button"
              >
                <section.icon
                  className="size-4"
                  weight={activeSection === section.id ? 'fill' : 'regular'}
                />
                {section.label}
              </button>
            ))}
          </nav>

          <ScrollArea className="min-h-0 w-full flex-1">
            {activeSection === 'general' && (
              <SettingsSectionContent
                description="Choose how ManyLatte looks and feels on this device."
                title="General"
              >
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
                      <SelectGroup>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </SettingsRow>
              </SettingsSectionContent>
            )}

            {activeSection === 'canvas' && (
              <SettingsSectionContent
                description="Adjust how the shared canvas behaves on this device."
                title="Canvas"
              >
                <SettingsRow
                  description="Display the dotted grid behind canvas items."
                  label="Show grid"
                >
                  <Switch
                    aria-label="Show grid"
                    checked={showGrid}
                    onCheckedChange={setShowGrid}
                  />
                </SettingsRow>
                <SettingsRow
                  description="Align items to the 32 pixel grid when placing or moving them."
                  label="Snap items to grid"
                >
                  <Switch
                    aria-label="Snap items to grid"
                    checked={snapToGrid}
                    onCheckedChange={setSnapToGrid}
                  />
                </SettingsRow>
                <SettingsRow
                  description="Choose what happens when you scroll over the canvas."
                  label="Mouse wheel behavior"
                >
                  <Select
                    onValueChange={(value) =>
                      setMouseWheelBehavior(value as MouseWheelBehavior)
                    }
                    value={mouseWheelBehavior}
                  >
                    <SelectTrigger
                      aria-label="Mouse wheel behavior"
                      className="w-32"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="pan">Pan</SelectItem>
                        <SelectItem value="zoom">Zoom</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </SettingsRow>
              </SettingsSectionContent>
            )}

            {activeSection === 'presence' && (
              <SettingsSectionContent
                description="Control how other participants appear on this device."
                title="Presence"
              >
                <SettingsRow
                  description="Set the visibility of other users' cursors and names."
                  label="Other cursors opacity"
                >
                  <div className="flex w-44 items-center gap-3">
                    <Slider
                      aria-label="Other cursors opacity"
                      max={100}
                      min={0}
                      onValueChange={(values) =>
                        setRemoteCursorOpacity(values[0] ?? 100)
                      }
                      step={10}
                      value={[remoteCursorOpacity]}
                    />
                    <output
                      aria-live="polite"
                      className="w-10 text-right text-sm tabular-nums text-muted-foreground"
                    >
                      {remoteCursorOpacity}%
                    </output>
                  </div>
                </SettingsRow>
              </SettingsSectionContent>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SettingsSection = 'general' | 'canvas' | 'presence';

interface SettingsSectionDefinition {
  icon: ComponentType<{
    className?: string;
    weight?: 'fill' | 'regular';
  }>;
  id: SettingsSection;
  label: string;
}

const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  { icon: GearIcon, id: 'general', label: 'General' },
  { icon: GridFourIcon, id: 'canvas', label: 'Canvas' },
  { icon: CursorIcon, id: 'presence', label: 'Presence' },
];

interface SettingsSectionContentProps {
  children: React.ReactNode;
  description: string;
  title: string;
}

function SettingsSectionContent({
  children,
  description,
  title,
}: SettingsSectionContentProps) {
  return (
    <section className="w-full px-5 py-6 sm:px-8 sm:py-8">
      <SettingsHeading description={description} title={title} />
      <div className="mt-7 w-full divide-y">{children}</div>
    </section>
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
