export type ContentPreset = 'tool_page' | 'blog_article';
export type ContentTone = 'expert' | 'practical' | 'business' | 'simple';
export type ContentGoal = 'ranking' | 'leads' | 'explain' | 'compare';

export type GenerationSettings = {
  preset: ContentPreset;
  tone: ContentTone;
  goal: ContentGoal;
  includeFaq: boolean;
  includeTable: boolean;
  includeLists: boolean;
  includeExamples: boolean;
  includeCta: boolean;
  minWords: number;
  maxWords: number;
};

export type ContentPlanBrief = {
  secondaryQueries: string[];
  requiredBlocks: string[];
  articleOutline: string[];
  faqItems: string[];
  schemaTypes: string[];
  linkingHints: string[];
  notesForLlm: string;
  generationSettings: GenerationSettings;
};

type ContentPlanBriefInput = {
  secondaryQueries?: unknown;
  requiredBlocks?: unknown;
  articleOutline?: unknown;
  faqItems?: unknown;
  schemaTypes?: unknown;
  linkingHints?: unknown;
  notesForLlm?: unknown;
  generationSettings?: unknown;
};

const MAX_ARRAY_ITEMS = 20;
const MAX_TEXT_LENGTH = 4000;

const PRESET_DEFAULTS: Record<ContentPreset, ContentPlanBrief> = {
  tool_page: {
    secondaryQueries: [],
    requiredBlocks: [
      'Что проверяет инструмент',
      'Когда использовать',
      'Как работает проверка',
      'Пошаговый сценарий',
      'Частые ошибки',
      'FAQ',
      'CTA',
    ],
    articleOutline: [
      'Что проверяет инструмент',
      'Когда использовать',
      'Как запустить проверку',
      'Как интерпретировать результат',
      'Типовые ошибки',
      'FAQ',
      'Вывод и CTA',
    ],
    faqItems: [],
    schemaTypes: ['FAQPage', 'BreadcrumbList'],
    linkingHints: [],
    notesForLlm: '',
    generationSettings: {
      preset: 'tool_page',
      tone: 'practical',
      goal: 'leads',
      includeFaq: true,
      includeTable: false,
      includeLists: true,
      includeExamples: true,
      includeCta: true,
      minWords: 1800,
      maxWords: 2800,
    },
  },
  blog_article: {
    secondaryQueries: [],
    requiredBlocks: [
      'Что это',
      'Когда возникает проблема',
      'Как проверить',
      'Как исправить',
      'Частые ошибки',
      'FAQ',
      'Вывод',
    ],
    articleOutline: [
      'Что это',
      'Почему возникает проблема',
      'Как проверить',
      'Как исправить',
      'Частые ошибки',
      'FAQ',
      'Вывод и CTA',
    ],
    faqItems: [],
    schemaTypes: ['Article', 'FAQPage', 'BreadcrumbList'],
    linkingHints: [],
    notesForLlm: '',
    generationSettings: {
      preset: 'blog_article',
      tone: 'expert',
      goal: 'ranking',
      includeFaq: true,
      includeTable: true,
      includeLists: true,
      includeExamples: true,
      includeCta: true,
      minWords: 2500,
      maxWords: 4000,
    },
  },
};

function uniqNormalized(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= MAX_ARRAY_ITEMS) break;
  }
  return result;
}

export function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return uniqNormalized(
    value
      .map((item) => (typeof item === 'string' ? item : ''))
      .filter(Boolean)
  );
}

export function parseTextareaList(value: string) {
  return uniqNormalized(
    value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function normalizeSettings(value: unknown, preset: ContentPreset): GenerationSettings {
  const base = PRESET_DEFAULTS[preset].generationSettings;
  if (!value || typeof value !== 'object') return { ...base };

  const record = value as Record<string, unknown>;
  const safePreset =
    record.preset === 'tool_page' || record.preset === 'blog_article'
      ? (record.preset as ContentPreset)
      : preset;
  const fallback = PRESET_DEFAULTS[safePreset].generationSettings;

  return {
    preset: safePreset,
    tone:
      record.tone === 'expert' || record.tone === 'practical' || record.tone === 'business' || record.tone === 'simple'
        ? record.tone
        : fallback.tone,
    goal:
      record.goal === 'ranking' || record.goal === 'leads' || record.goal === 'explain' || record.goal === 'compare'
        ? record.goal
        : fallback.goal,
    includeFaq: typeof record.includeFaq === 'boolean' ? record.includeFaq : fallback.includeFaq,
    includeTable: typeof record.includeTable === 'boolean' ? record.includeTable : fallback.includeTable,
    includeLists: typeof record.includeLists === 'boolean' ? record.includeLists : fallback.includeLists,
    includeExamples: typeof record.includeExamples === 'boolean' ? record.includeExamples : fallback.includeExamples,
    includeCta: typeof record.includeCta === 'boolean' ? record.includeCta : fallback.includeCta,
    minWords:
      typeof record.minWords === 'number' && Number.isFinite(record.minWords)
        ? Math.max(500, Math.min(10000, Math.round(record.minWords)))
        : fallback.minWords,
    maxWords:
      typeof record.maxWords === 'number' && Number.isFinite(record.maxWords)
        ? Math.max(800, Math.min(15000, Math.round(record.maxWords)))
        : fallback.maxWords,
  };
}

export function buildDefaultContentPlanBrief(
  contentType: string,
  options?: {
    secondaryQueries?: string[];
    faqItems?: string[];
    linkingHints?: string[];
  }
): ContentPlanBrief {
  const preset: ContentPreset = contentType === 'tool_page' ? 'tool_page' : 'blog_article';
  const base = PRESET_DEFAULTS[preset];
  return {
    secondaryQueries: uniqNormalized(options?.secondaryQueries || []),
    requiredBlocks: [...base.requiredBlocks],
    articleOutline: [...base.articleOutline],
    faqItems: uniqNormalized(options?.faqItems || []),
    schemaTypes: [...base.schemaTypes],
    linkingHints: uniqNormalized(options?.linkingHints || []),
    notesForLlm: '',
    generationSettings: { ...base.generationSettings },
  };
}

export function normalizeContentPlanBrief(
  raw: ContentPlanBriefInput | null | undefined,
  contentType: string
): ContentPlanBrief {
  const preset: ContentPreset = contentType === 'tool_page' ? 'tool_page' : 'blog_article';
  const base = buildDefaultContentPlanBrief(contentType);

  return {
    secondaryQueries: normalizeStringArray(raw?.secondaryQueries).length
      ? normalizeStringArray(raw?.secondaryQueries)
      : base.secondaryQueries,
    requiredBlocks: normalizeStringArray(raw?.requiredBlocks).length
      ? normalizeStringArray(raw?.requiredBlocks)
      : base.requiredBlocks,
    articleOutline: normalizeStringArray(raw?.articleOutline).length
      ? normalizeStringArray(raw?.articleOutline)
      : base.articleOutline,
    faqItems: normalizeStringArray(raw?.faqItems),
    schemaTypes: normalizeStringArray(raw?.schemaTypes).length
      ? normalizeStringArray(raw?.schemaTypes)
      : base.schemaTypes,
    linkingHints: normalizeStringArray(raw?.linkingHints),
    notesForLlm:
      typeof raw?.notesForLlm === 'string'
        ? raw.notesForLlm.trim().slice(0, MAX_TEXT_LENGTH)
        : base.notesForLlm,
    generationSettings: normalizeSettings(raw?.generationSettings, preset),
  };
}
