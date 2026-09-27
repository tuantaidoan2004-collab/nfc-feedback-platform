import type { ReactNode } from 'react';
import PlatformShell from '@/components/platform/shell';
// A platform surface (lát S1): the Quite Sensational ground, in the viewer's theme.
export default function Layout({ children }: { children: ReactNode }) { return <PlatformShell>{children}</PlatformShell>; }
