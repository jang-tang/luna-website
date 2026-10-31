/** 동기화에 필요한 범위만 정의한 Notion API 응답 타입 (Notion-Version 2026-03-11). */

export type RichText = {
  type: string;
  plain_text: string;
  href?: string | null;
};

export type NotionFile =
  | { type: 'file'; name?: string; file: { url: string; expiry_time?: string } }
  | { type: 'external'; name?: string; external: { url: string } }
  | { type: 'file_upload'; name?: string; file_upload: { id: string } };

export type NotionPropertyValue =
  | { id: string; type: 'title'; title: RichText[] }
  | { id: string; type: 'rich_text'; rich_text: RichText[] }
  | { id: string; type: 'number'; number: number | null }
  | { id: string; type: 'checkbox'; checkbox: boolean }
  | { id: string; type: 'select'; select: { id?: string; name: string } | null }
  | { id: string; type: 'multi_select'; multi_select: Array<{ id?: string; name: string }> }
  | { id: string; type: 'files'; files: NotionFile[] }
  | { id: string; type: 'url'; url: string | null }
  | { id: string; type: 'date'; date: { start: string; end?: string | null } | null }
  | { id: string; type: string; [key: string]: unknown };

export type NotionPage = {
  object: 'page';
  id: string;
  created_time: string;
  last_edited_time: string;
  in_trash?: boolean;
  is_archived?: boolean;
  url?: string;
  parent?: { type: string; data_source_id?: string; database_id?: string; page_id?: string };
  properties: Record<string, NotionPropertyValue>;
};

export type NotionList<T> = {
  object: 'list';
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
  request_status?: { type: 'complete' | 'incomplete'; incomplete_reason?: string };
};

export type NotionDataSource = {
  object: 'data_source';
  id: string;
  title?: RichText[];
  properties: Record<string, { id: string; name: string; type: string; select?: { options: Array<{ id: string; name: string }> } }>;
};

export type NotionPropertyItemList = {
  object: 'list';
  results: Array<{ object: 'property_item'; type: string; rich_text?: RichText; title?: RichText }>;
  next_cursor: string | null;
  has_more: boolean;
};
