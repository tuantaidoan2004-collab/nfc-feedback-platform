import type { Words } from '@/lib/canvas/doc';

/** Vietnamese always; English when written, shown by the page's language (canvas.css hides the other). */
export function WordsView({ words, colors }: { words: Words; colors?: string[] }) {
  const paintLetters = (text: string) => {
    if (!colors?.length) return text;
    let i = 0;
    return <span className="cv-letters">{Array.from(text).map((ch, k) => /\s/.test(ch) ? ch : <span key={k} style={{ color: colors[i++ % colors.length] }}>{ch}</span>)}</span>;
  };
  if (!words.en?.trim()) return <>{paintLetters(words.vi)}</>;
  return <><span className="cv-vi">{paintLetters(words.vi)}</span><span className="cv-en">{paintLetters(words.en)}</span></>;
}

