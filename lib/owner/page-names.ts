/**
 * What a shop's pages are called until someone renames them: the first is "Trang chính", the next ones are numbered. Library
 * names the pages it makes this way, and so do /gov and the local seed for a shop's first page, so no page reads as unnamed.
 */
export const pageLabel = (existingPages: number) => existingPages ? `Trang ${existingPages + 1}` : 'Trang chính';
