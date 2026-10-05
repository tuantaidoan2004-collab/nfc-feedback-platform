import { redirect } from 'next/navigation';

/** The old dashboard address (before 05/10). Old links and bookmarks land in the giao diện chính. */
export default async function Page({ params }: { params: Promise<{ shop: string }> }) {
  redirect(`/app/${encodeURIComponent((await params).shop)}`);
}
