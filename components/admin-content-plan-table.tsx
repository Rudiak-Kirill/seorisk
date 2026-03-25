'use client';

import { useMemo, useState } from 'react';
import { buildDefaultContentPlanBrief, parseTextareaList, type GenerationSettings } from '@/lib/content-plan-brief';

type ContentPlanRow = {
  id: string;
  researchId: string;
  clusterId: string | null;
  sourceUrl: string;
  targetUrl: string;
  contentType: string;
  title: string;
  metaDescription: string | null;
  mainQuery: string;
  secondaryQueries: string[];
  generationSettings: GenerationSettings;
  requiredBlocks: string[];
  articleOutline: string[];
  faqItems: string[];
  schemaTypes: string[];
  linkingHints: string[];
  notesForLlm: string | null;
  articlePreview: string | null;
  plannedDate: string | null;
  status: string;
  isApproved: boolean;
  approvedAt: string | Date | null;
  publishedAt: string | Date | null;
  publishedUrl: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  totalFrequency: number | null;
  researchUrl: string | null;
};

type BriefDraft = {
  id: string;
  title: string;
  metaDescription: string;
  mainQuery: string;
  secondaryQueriesText: string;
  requiredBlocksText: string;
  articleOutlineText: string;
  faqItemsText: string;
  schemaTypesText: string;
  linkingHintsText: string;
  notesForLlm: string;
  generationSettings: GenerationSettings;
};

type Props = {
  initialItems: ContentPlanRow[];
};

function renderMarkdown(value: string) {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^\- (.*)$/gm, '<li>$1</li>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
}

function formatFrequency(value: number | null) {
  if (value === null || value === undefined) return '—';
  return `${new Intl.NumberFormat('ru-RU').format(value)}/мес`;
}

function listToTextarea(values: string[]) {
  return values.join('\n');
}

function createBriefDraft(item: ContentPlanRow): BriefDraft {
  return {
    id: item.id,
    title: item.title,
    metaDescription: item.metaDescription || '',
    mainQuery: item.mainQuery,
    secondaryQueriesText: listToTextarea(item.secondaryQueries || []),
    requiredBlocksText: listToTextarea(item.requiredBlocks || []),
    articleOutlineText: listToTextarea(item.articleOutline || []),
    faqItemsText: listToTextarea(item.faqItems || []),
    schemaTypesText: listToTextarea(item.schemaTypes || []),
    linkingHintsText: listToTextarea(item.linkingHints || []),
    notesForLlm: item.notesForLlm || '',
    generationSettings: { ...item.generationSettings },
  };
}

export default function AdminContentPlanTable({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [briefId, setBriefId] = useState<string | null>(null);
  const [briefDraft, setBriefDraft] = useState<BriefDraft | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeItem = items.find((item) => item.id === activeId) || null;
  const briefItem = items.find((item) => item.id === briefId) || null;

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (typeFilter !== 'all' && item.contentType !== typeFilter) return false;
      return true;
    });
  }, [items, statusFilter, typeFilter]);

  async function refresh() {
    const response = await fetch('/api/admin/content-plan', { cache: 'no-store' });
    const payload = (await response.json()) as { ok?: boolean; items?: ContentPlanRow[]; error?: string };
    if (!response.ok || !payload.ok || !payload.items) {
      throw new Error(payload.error || 'Не удалось обновить контент-план');
    }
    setItems(payload.items);
  }

  async function patchRow(id: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/admin/content-plan/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Не удалось сохранить запись');
    }
  }

  async function runAction(id: string, action: () => Promise<void>) {
    setError(null);
    setLoadingId(id);
    try {
      await action();
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Ошибка');
    } finally {
      setLoadingId(null);
    }
  }

  function openBrief(item: ContentPlanRow) {
    setBriefId(item.id);
    setBriefDraft(createBriefDraft(item));
  }

  function applyPreset(preset: 'tool_page' | 'blog_article') {
    if (!briefDraft || !briefItem) return;
    const defaults = buildDefaultContentPlanBrief(preset, {
      secondaryQueries: parseTextareaList(briefDraft.secondaryQueriesText),
      faqItems: parseTextareaList(briefDraft.faqItemsText),
      linkingHints: parseTextareaList(briefDraft.linkingHintsText),
    });

    setBriefDraft({
      ...briefDraft,
      requiredBlocksText: listToTextarea(defaults.requiredBlocks),
      articleOutlineText: listToTextarea(defaults.articleOutline),
      schemaTypesText: listToTextarea(defaults.schemaTypes),
      generationSettings: { ...defaults.generationSettings, preset },
    });
  }

  async function saveBrief() {
    if (!briefDraft || !briefItem) return;

    await runAction(briefDraft.id, async () => {
      await patchRow(briefDraft.id, {
        title: briefDraft.title,
        metaDescription: briefDraft.metaDescription || null,
        mainQuery: briefDraft.mainQuery,
        secondaryQueries: parseTextareaList(briefDraft.secondaryQueriesText),
        requiredBlocks: parseTextareaList(briefDraft.requiredBlocksText),
        articleOutline: parseTextareaList(briefDraft.articleOutlineText),
        faqItems: parseTextareaList(briefDraft.faqItemsText),
        schemaTypes: parseTextareaList(briefDraft.schemaTypesText),
        linkingHints: parseTextareaList(briefDraft.linkingHintsText),
        notesForLlm: briefDraft.notesForLlm,
        generationSettings: briefDraft.generationSettings,
      });
      setBriefId(null);
      setBriefDraft(null);
    });
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {['all', 'draft', 'review', 'approved', 'published'].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className="rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-700"
            >
              {value === 'all' ? 'Все статусы' : value}
            </button>
          ))}
          {['all', 'tool_page', 'blog_article'].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTypeFilter(value)}
              className="rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-700"
            >
              {value === 'all' ? 'Все типы' : value}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="px-3 py-3 font-medium">Статья</th>
                <th className="px-3 py-3 font-medium">URL</th>
                <th className="px-3 py-3 font-medium">Тип</th>
                <th className="px-3 py-3 font-medium">Частота</th>
                <th className="px-3 py-3 font-medium">Дата</th>
                <th className="px-3 py-3 font-medium">Статус</th>
                <th className="px-3 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-4">
                    <div className="font-medium text-gray-900">{item.title}</div>
                    <div className="mt-1 text-xs text-gray-500">{item.mainQuery}</div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="text-gray-900">{item.targetUrl}</div>
                    <div className="mt-1 text-xs text-gray-500">{item.researchUrl || item.sourceUrl}</div>
                  </td>
                  <td className="px-3 py-4 text-gray-700">{item.contentType}</td>
                  <td className="px-3 py-4 text-gray-700">{formatFrequency(item.totalFrequency)}</td>
                  <td className="px-3 py-4">
                    <input
                      type="date"
                      value={item.plannedDate || ''}
                      onChange={(event) =>
                        runAction(item.id, async () => {
                          await patchRow(item.id, { plannedDate: event.target.value || null });
                        })
                      }
                      className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700"
                    />
                  </td>
                  <td className="px-3 py-4 text-gray-700">{item.status}</td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={item.status}
                        onChange={(event) =>
                          runAction(item.id, async () => {
                            await patchRow(item.id, {
                              status: event.target.value,
                              isApproved: event.target.value === 'approved' ? true : item.isApproved,
                              approvedAt:
                                event.target.value === 'approved'
                                  ? new Date().toISOString()
                                  : event.target.value === 'draft'
                                    ? null
                                    : item.approvedAt,
                            });
                          })
                        }
                        className="rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-700"
                      >
                        <option value="draft">draft</option>
                        <option value="review">review</option>
                        <option value="approved">approved</option>
                        <option value="published">published</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveId(item.id);
                          setDraft(item.articlePreview || '');
                        }}
                        className="rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-700"
                      >
                        👁 Предпросмотр
                      </button>
                      <button
                        type="button"
                        onClick={() => openBrief(item)}
                        className="rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-700"
                      >
                        SEO brief
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(item.id, async () => {
                            const response = await fetch(`/api/admin/content-plan/${item.id}/generate-article`, {
                              method: 'POST',
                            });
                            const payload = (await response.json()) as { ok?: boolean; error?: string };
                            if (!response.ok || !payload.ok) {
                              throw new Error(payload.error || 'Не удалось сгенерировать статью');
                            }
                          })
                        }
                        className="rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-700"
                      >
                        {loadingId === item.id ? '...' : '✏️ Сгенерировать'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(item.id, async () => {
                            const response = await fetch(`/api/admin/content-plan/${item.id}/approve`, {
                              method: 'POST',
                            });
                            const payload = (await response.json()) as { ok?: boolean; error?: string };
                            if (!response.ok || !payload.ok) {
                              throw new Error(payload.error || 'Не удалось одобрить');
                            }
                          })
                        }
                        className="rounded-full border border-emerald-200 px-3 py-2 text-xs text-emerald-700"
                      >
                        ✅ Одобрить
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(item.id, async () => {
                            const publishedUrl =
                              window.prompt('Финальный published URL', item.publishedUrl || item.targetUrl) || '';
                            await patchRow(item.id, {
                              status: 'published',
                              publishedAt: new Date().toISOString(),
                              publishedUrl: publishedUrl || null,
                              isApproved: true,
                              approvedAt: item.approvedAt || new Date().toISOString(),
                            });
                          })
                        }
                        className="rounded-full border border-blue-200 px-3 py-2 text-xs text-blue-700"
                      >
                        Опубликовано
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(item.id, async () => {
                            const response = await fetch(`/api/admin/content-plan/${item.id}`, {
                              method: 'DELETE',
                            });
                            const payload = (await response.json()) as { ok?: boolean; error?: string };
                            if (!response.ok || !payload.ok) {
                              throw new Error(payload.error || 'Не удалось удалить');
                            }
                          })
                        }
                        className="rounded-full border border-red-200 px-3 py-2 text-xs text-red-700"
                      >
                        🗑 Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {briefItem && briefDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">SEO brief</h3>
                <p className="mt-1 text-sm text-gray-500">{briefItem.targetUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBriefId(null);
                  setBriefDraft(null);
                }}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700"
              >
                Закрыть
              </button>
            </div>

            <div className="grid max-h-[78vh] gap-0 overflow-y-auto lg:grid-cols-2">
              <div className="space-y-4 border-r border-gray-200 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Заголовок</span>
                    <input
                      value={briefDraft.title}
                      onChange={(event) => setBriefDraft({ ...briefDraft, title: event.target.value })}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-800"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Главный запрос</span>
                    <input
                      value={briefDraft.mainQuery}
                      onChange={(event) => setBriefDraft({ ...briefDraft, mainQuery: event.target.value })}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-800"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-gray-700">Meta description</span>
                  <textarea
                    value={briefDraft.metaDescription}
                    onChange={(event) => setBriefDraft({ ...briefDraft, metaDescription: event.target.value })}
                    className="h-24 w-full rounded-2xl border border-gray-200 p-4 text-sm text-gray-800"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-gray-700">Вторичные запросы</span>
                  <textarea
                    value={briefDraft.secondaryQueriesText}
                    onChange={(event) => setBriefDraft({ ...briefDraft, secondaryQueriesText: event.target.value })}
                    className="h-28 w-full rounded-2xl border border-gray-200 p-4 text-sm text-gray-800"
                    placeholder="По одному запросу на строку"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-gray-700">Обязательные блоки</span>
                  <textarea
                    value={briefDraft.requiredBlocksText}
                    onChange={(event) => setBriefDraft({ ...briefDraft, requiredBlocksText: event.target.value })}
                    className="h-28 w-full rounded-2xl border border-gray-200 p-4 text-sm text-gray-800"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-gray-700">Outline статьи</span>
                  <textarea
                    value={briefDraft.articleOutlineText}
                    onChange={(event) => setBriefDraft({ ...briefDraft, articleOutlineText: event.target.value })}
                    className="h-28 w-full rounded-2xl border border-gray-200 p-4 text-sm text-gray-800"
                  />
                </label>
              </div>

              <div className="space-y-4 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Пресет</span>
                    <div className="flex gap-2">
                      <select
                        value={briefDraft.generationSettings.preset}
                        onChange={(event) =>
                          setBriefDraft({
                            ...briefDraft,
                            generationSettings: {
                              ...briefDraft.generationSettings,
                              preset: event.target.value as GenerationSettings['preset'],
                            },
                          })
                        }
                        className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-800"
                      >
                        <option value="tool_page">tool_page</option>
                        <option value="blog_article">blog_article</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => applyPreset(briefDraft.generationSettings.preset)}
                        className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700"
                      >
                        Применить
                      </button>
                    </div>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Тон</span>
                    <select
                      value={briefDraft.generationSettings.tone}
                      onChange={(event) =>
                        setBriefDraft({
                          ...briefDraft,
                          generationSettings: {
                            ...briefDraft.generationSettings,
                            tone: event.target.value as GenerationSettings['tone'],
                          },
                        })
                      }
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-800"
                    >
                      <option value="expert">expert</option>
                      <option value="practical">practical</option>
                      <option value="business">business</option>
                      <option value="simple">simple</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Цель</span>
                    <select
                      value={briefDraft.generationSettings.goal}
                      onChange={(event) =>
                        setBriefDraft({
                          ...briefDraft,
                          generationSettings: {
                            ...briefDraft.generationSettings,
                            goal: event.target.value as GenerationSettings['goal'],
                          },
                        })
                      }
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-800"
                    >
                      <option value="ranking">ranking</option>
                      <option value="leads">leads</option>
                      <option value="explain">explain</option>
                      <option value="compare">compare</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Schema</span>
                    <textarea
                      value={briefDraft.schemaTypesText}
                      onChange={(event) => setBriefDraft({ ...briefDraft, schemaTypesText: event.target.value })}
                      className="h-24 w-full rounded-2xl border border-gray-200 p-4 text-sm text-gray-800"
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ['includeFaq', 'FAQ'],
                    ['includeTable', 'Таблицы'],
                    ['includeLists', 'Списки'],
                    ['includeExamples', 'Примеры'],
                    ['includeCta', 'CTA'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={Boolean(briefDraft.generationSettings[key as keyof GenerationSettings])}
                        onChange={(event) =>
                          setBriefDraft({
                            ...briefDraft,
                            generationSettings: {
                              ...briefDraft.generationSettings,
                              [key]: event.target.checked,
                            },
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Минимум слов</span>
                    <input
                      type="number"
                      value={briefDraft.generationSettings.minWords}
                      onChange={(event) =>
                        setBriefDraft({
                          ...briefDraft,
                          generationSettings: {
                            ...briefDraft.generationSettings,
                            minWords: Number(event.target.value) || 0,
                          },
                        })
                      }
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-800"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Максимум слов</span>
                    <input
                      type="number"
                      value={briefDraft.generationSettings.maxWords}
                      onChange={(event) =>
                        setBriefDraft({
                          ...briefDraft,
                          generationSettings: {
                            ...briefDraft.generationSettings,
                            maxWords: Number(event.target.value) || 0,
                          },
                        })
                      }
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-800"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-gray-700">FAQ</span>
                  <textarea
                    value={briefDraft.faqItemsText}
                    onChange={(event) => setBriefDraft({ ...briefDraft, faqItemsText: event.target.value })}
                    className="h-24 w-full rounded-2xl border border-gray-200 p-4 text-sm text-gray-800"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-gray-700">Внутренние ссылки / подсказки</span>
                  <textarea
                    value={briefDraft.linkingHintsText}
                    onChange={(event) => setBriefDraft({ ...briefDraft, linkingHintsText: event.target.value })}
                    className="h-24 w-full rounded-2xl border border-gray-200 p-4 text-sm text-gray-800"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-gray-700">Примечания для генерации</span>
                  <textarea
                    value={briefDraft.notesForLlm}
                    onChange={(event) => setBriefDraft({ ...briefDraft, notesForLlm: event.target.value })}
                    className="h-32 w-full rounded-2xl border border-gray-200 p-4 text-sm text-gray-800"
                    placeholder="Тон, ограничения, обязательные формулировки, запреты."
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveBrief}
                    className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Сохранить brief
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{activeItem.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{activeItem.targetUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700"
              >
                Закрыть
              </button>
            </div>

            <div className="grid gap-0 lg:grid-cols-2">
              <div className="border-r border-gray-200 p-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">Markdown</label>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="h-[65vh] w-full rounded-2xl border border-gray-200 p-4 text-sm text-gray-800"
                />
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      runAction(activeItem.id, async () => {
                        await patchRow(activeItem.id, {
                          articlePreview: draft,
                          status: activeItem.status === 'draft' ? 'review' : activeItem.status,
                        });
                        setActiveId(null);
                      })
                    }
                    className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Сохранить
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto p-6">
                <div
                  className="prose prose-sm max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(draft || activeItem.articlePreview || '')}</p>` }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
