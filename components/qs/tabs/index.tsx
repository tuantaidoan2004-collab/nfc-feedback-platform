'use client';
/** Nội dung từng tab (kịch bản mục 7). Mỗi tab tự hỏi API của nó. */
import type { TabKey } from '../tabs-config';
import DashboardTab from './dashboard';
import DataTab from './data';
import LibraryTab from './library';
import MyCardTab from './my-card';
import ManageTab from './manage';
import SettingsTab from './settings';

import type { TemplateCard } from '@/lib/canvas/templates';
export type TabProps = { slug: string; name: string; origin: string; role: string; onboarding: boolean; query: Record<string, string | undefined>;
  /** The Library's templates and their groups (lib/canvas/templates.ts); empty on the other tabs. */
  templates: TemplateCard[]; groups: string[] };
export default function TabContent({ tab, ...props }: { tab: TabKey } & TabProps) {
  switch (tab) {
    case 'dashboard': return <DashboardTab {...props} />;
    case 'data': return <DataTab {...props} />;
    case 'library': return <LibraryTab {...props} />;
    case 'my-card': return <MyCardTab {...props} />;
    case 'quan-ly': return <ManageTab {...props} />;
    case 'cai-dat': return <SettingsTab {...props} />;
  }
}
