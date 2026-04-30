'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Briefcase,
  FileText,
  Loader2,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';

type ResumeProfile = {
  id: number;
  name: string;
  position: string;
  skills: string;
  experience_summary: string;
  salary_expected: number | null;
  stop_words: string | null;
  cover_letter_tone: string;
  contact_phone: string | null;
  contact_email: string | null;
  location: string | null;
  citizenship: string | null;
  work_format: string | null;
  employment_type: string | null;
  travel_readiness: string | null;
  education: string | null;
  courses: string | null;
  languages: string | null;
  about: string | null;
};

type SearchProfile = {
  id: number;
  profile_id: number | null;
  keywords: string;
  area: number;
  active: boolean;
};

type Vacancy = {
  vacancy_id: string;
  profile_id: number | null;
  url: string;
  title: string;
  employer: string | null;
  salary_text: string | null;
  description: string | null;
  experience: string | null;
  employment: string | null;
  work_format: string | null;
  key_skills: string[];
  score: number | null;
  score_reason: string | null;
  status: string;
  flags: { has_salary: boolean; remote: boolean; part_time: boolean };
};

type SettingsResponse = {
  profiles: ResumeProfile[];
  profile: ResumeProfile | null;
  search_profiles: SearchProfile[];
};

type JobsResponse = {
  collector: {
    enabled: boolean;
    interval_hours: number;
    next_run_at: string | null;
  };
};

const emptyForm = {
  name: '',
  position: '',
  skills: '',
  experience_summary: '',
  salary_expected: '',
  stop_words: '',
  cover_letter_tone: 'formal',
  contact_phone: '',
  contact_email: '',
  location: '',
  citizenship: '',
  work_format: 'удалённо',
  employment_type: 'полная занятость, частичная занятость, проектная работа/разовое задание',
  travel_readiness: '',
  education: '',
  courses: '',
  languages: '',
  about: '',
};

type ProfileForm = typeof emptyForm;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/hh-agent${path}`, {
    ...init,
    cache: 'no-store',
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    new: 'новая',
    scored: 'оценена',
    skipped: 'пропущена',
    applied: 'откликнулся',
    hidden: 'скрыта',
  };
  return labels[status] || status;
}

function statusClass(status: string) {
  if (status === 'scored' || status === 'applied') return 'bg-emerald-50 text-emerald-700';
  if (status === 'hidden' || status === 'skipped') return 'bg-gray-100 text-gray-600';
  return 'bg-blue-50 text-blue-700';
}

function scoreClass(score: number | null) {
  if (score === null) return 'bg-gray-100 text-gray-500';
  if (score >= 70) return 'bg-emerald-50 text-emerald-700';
  if (score >= 50) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

function formatNextRun(value: string | null) {
  if (!value) return 'не запланирован';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'не запланирован';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HhAgentClient() {
  const [tab, setTab] = useState<'vacancies' | 'responses' | 'settings'>('vacancies');
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [salaryFilter, setSalaryFilter] = useState('');
  const [remoteFilter, setRemoteFilter] = useState('');
  const [partFilter, setPartFilter] = useState('');
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [searchKeywords, setSearchKeywords] = useState('');
  const [searchArea, setSearchArea] = useState('1');
  const [letter, setLetter] = useState<{ title: string; url: string; cover_letter: string } | null>(null);
  const [jobStatus, setJobStatus] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');

  const activeProfile = profiles.find((item) => item.id === activeProfileId) || null;

  const filteredSearchProfiles = useMemo(
    () => searchProfiles.filter((item) => item.profile_id === activeProfileId),
    [searchProfiles, activeProfileId]
  );

  const filteredVacancies = useMemo(
    () =>
      vacancies.filter((item) => {
        if (salaryFilter && item.flags.has_salary !== (salaryFilter === 'yes')) return false;
        if (remoteFilter && item.flags.remote !== (remoteFilter === 'yes')) return false;
        if (partFilter && item.flags.part_time !== (partFilter === 'yes')) return false;
        return true;
      }),
    [vacancies, salaryFilter, remoteFilter, partFilter]
  );

  useEffect(() => {
    loadSettings();
    loadJobStatus();
  }, []);

  useEffect(() => {
    if (activeProfile) {
      setForm({
        name: activeProfile.name || '',
        position: activeProfile.position || '',
        skills: activeProfile.skills || '',
        experience_summary: activeProfile.experience_summary || '',
        salary_expected: activeProfile.salary_expected ? String(activeProfile.salary_expected) : '',
        stop_words: activeProfile.stop_words || '',
        cover_letter_tone: activeProfile.cover_letter_tone || 'formal',
        contact_phone: activeProfile.contact_phone || '',
        contact_email: activeProfile.contact_email || '',
        location: activeProfile.location || '',
        citizenship: activeProfile.citizenship || '',
        work_format: activeProfile.work_format || '',
        employment_type: activeProfile.employment_type || '',
        travel_readiness: activeProfile.travel_readiness || '',
        education: activeProfile.education || '',
        courses: activeProfile.courses || '',
        languages: activeProfile.languages || '',
        about: activeProfile.about || '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [activeProfileId, profiles]);

  useEffect(() => {
    if (activeProfileId) {
      loadVacancies();
      if (tab === 'responses') loadResponses();
    }
  }, [activeProfileId, status]);

  async function run<T>(label: string, fn: () => Promise<T>) {
    setLoading(label);
    setMessage('');
    try {
      const result = await fn();
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка запроса');
      throw error;
    } finally {
      setLoading('');
    }
  }

  async function loadSettings() {
    const data = await api<SettingsResponse>('/settings');
    setProfiles(data.profiles || []);
    setSearchProfiles(data.search_profiles || []);
    setActiveProfileId((current) => current || data.profiles?.[0]?.id || null);
  }

  async function loadVacancies() {
    if (!activeProfileId) return;
    const query = new URLSearchParams({
      profile_id: String(activeProfileId),
      status,
      limit: '100',
    });
    const data = await api<{ total: number; items: Vacancy[] }>(`/vacancies?${query}`);
    setVacancies(data.items || []);
  }

  async function loadResponses() {
    if (!activeProfileId) return;
    const data = await api<any[]>(`/negotiations?profile_id=${activeProfileId}`);
    setResponses(data || []);
  }

  async function loadJobStatus() {
    try {
      const data = await api<JobsResponse>('/jobs');
      setJobStatus(data);
    } catch {
      setJobStatus(null);
    }
  }

  async function saveProfile() {
    const saved = await run('save-profile', () =>
      api<{ profile: ResumeProfile }>('/settings/profile', {
        method: 'PUT',
        body: JSON.stringify({
          id: activeProfileId,
          ...form,
          salary_expected: form.salary_expected ? Number(form.salary_expected) : null,
        }),
      })
    );
    setActiveProfileId(saved.profile.id);
    await loadSettings();
    setMessage('Резюме сохранено');
  }

  async function deleteProfile() {
    if (!activeProfileId) return;
    await run('delete-profile', () => api(`/settings/profile/${activeProfileId}`, { method: 'DELETE' }));
    setActiveProfileId(null);
    await loadSettings();
    setMessage('Резюме удалено');
  }

  async function addSearchProfile() {
    if (!activeProfileId || !searchKeywords.trim()) return;
    await run('add-search', () =>
      api('/settings/search-profiles', {
        method: 'POST',
        body: JSON.stringify({
          profile_id: activeProfileId,
          keywords: searchKeywords.trim(),
          area: Number(searchArea) || 1,
        }),
      })
    );
    setSearchKeywords('');
    await loadSettings();
  }

  async function deleteSearchProfile(id: number) {
    await run('delete-search', () => api(`/settings/search-profiles/${id}`, { method: 'DELETE' }));
    await loadSettings();
  }

  async function collectVacancies() {
    await run('collect', () =>
      api('/vacancies/collect', {
        method: 'POST',
        body: JSON.stringify({ profile_id: activeProfileId }),
      })
    );
    await loadVacancies();
    await loadJobStatus();
  }

  async function scoreVacancies() {
    await run('score', () =>
      api('/vacancies/score', {
        method: 'POST',
        body: JSON.stringify({ profile_id: activeProfileId }),
      })
    );
    await loadVacancies();
  }

  async function hideVacancy(id: string) {
    await run('hide', () => api(`/vacancies/${id}/hide?profile_id=${activeProfileId}`, { method: 'PATCH' }));
    await loadVacancies();
  }

  async function prepareLetter(id: string) {
    const data = await run('letter', () =>
      api<{ title: string; url: string; cover_letter: string }>('/prepare', {
        method: 'POST',
        body: JSON.stringify({ vacancy_id: id, profile_id: activeProfileId }),
      })
    );
    setLetter(data);
  }

  async function markApplied(id: string) {
    await run('applied', () => api(`/vacancies/${id}/applied?profile_id=${activeProfileId}`, { method: 'PATCH' }));
    await loadResponses();
  }

  async function importPdf(file: File | null) {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const data = await run('import-pdf', () =>
      api<{ profile: Partial<ResumeProfile> }>('/settings/profile/import-pdf', {
        method: 'POST',
        body: formData,
      })
    );
    setForm((current) => ({
      ...current,
      name: data.profile.name || current.name,
      position: data.profile.position || current.position,
      skills: data.profile.skills || current.skills,
      experience_summary: data.profile.experience_summary || current.experience_summary,
      salary_expected: data.profile.salary_expected ? String(data.profile.salary_expected) : current.salary_expected,
    }));
  }

  const isBusy = Boolean(loading);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">HH Agent</h1>
          <p className="mt-1 text-sm text-gray-500">Вакансии, резюме, скоринг и отклики доступны только после входа.</p>
        </div>
        {isBusy ? (
          <div className="inline-flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Выполняю запрос
          </div>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-200">
        <TabButton active={tab === 'vacancies'} onClick={() => setTab('vacancies')} icon={<Briefcase className="h-4 w-4" />} label="Вакансии" />
        <TabButton active={tab === 'responses'} onClick={() => { setTab('responses'); loadResponses(); }} icon={<FileText className="h-4 w-4" />} label="Отклики" />
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={<Settings className="h-4 w-4" />} label="Настройки" />
      </div>

      {message ? <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div> : null}

      {tab === 'vacancies' ? (
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select value={activeProfileId || ''} onChange={(value) => setActiveProfileId(Number(value) || null)}>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name || profile.position}</option>
              ))}
            </Select>
            <Select value={status} onChange={setStatus}>
              <option value="">Все статусы</option>
              <option value="scored">Оценённые</option>
              <option value="new">Новые</option>
              <option value="applied">Откликнулся</option>
              <option value="skipped">Пропущенные</option>
              <option value="hidden">Скрытые</option>
            </Select>
            <Select value={salaryFilter} onChange={setSalaryFilter}>
              <option value="">ЗП: все</option>
              <option value="yes">Есть ЗП</option>
              <option value="no">Без ЗП</option>
            </Select>
            <Select value={remoteFilter} onChange={setRemoteFilter}>
              <option value="">Удалёнка: все</option>
              <option value="yes">Удалёнка</option>
              <option value="no">Не удалёнка</option>
            </Select>
            <Select value={partFilter} onChange={setPartFilter}>
              <option value="">Занятость: все</option>
              <option value="yes">Частичная/проект</option>
              <option value="no">Не частичная</option>
            </Select>
            <button onClick={collectVacancies} className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800">
              Собрать
            </button>
            <button onClick={scoreVacancies} className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800 hover:bg-gray-200">
              Скоринг
            </button>
            {jobStatus?.collector ? (
              <span className="text-sm text-gray-500">
                Автосбор: каждые {jobStatus.collector.interval_hours} ч, следующий {formatNextRun(jobStatus.collector.next_run_at)}
              </span>
            ) : null}
            <span className="ml-auto text-sm text-gray-500">{filteredVacancies.length} из {vacancies.length}</span>
          </div>
          <VacanciesTable items={filteredVacancies} onLetter={prepareLetter} onHide={hideVacancy} />
        </section>
      ) : null}

      {tab === 'responses' ? (
        <section className="space-y-3">
          {responses.length ? responses.map((item) => (
            <div key={item.id} className="rounded-md border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-gray-900">{item.title}</div>
                  <div className="text-sm text-gray-500">{item.employer}</div>
                </div>
                <button onClick={() => markApplied(item.vacancy_id)} className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Отмечено</button>
              </div>
              <textarea className="mt-3 min-h-32 w-full rounded-md border border-gray-200 p-3 text-sm" readOnly value={item.cover_letter} />
            </div>
          )) : <Empty text="Нет откликов для выбранного резюме" />}
        </section>
      ) : null}

      {tab === 'settings' ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Select value={activeProfileId || ''} onChange={(value) => setActiveProfileId(Number(value) || null)}>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name || profile.position}</option>
                ))}
              </Select>
              <button onClick={() => { setActiveProfileId(null); setForm(emptyForm); }} className="inline-flex items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800">
                <Plus className="h-4 w-4" />
                Новое резюме
              </button>
              <button onClick={deleteProfile} className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                <Trash2 className="h-4 w-4" />
                Удалить
              </button>
            </div>
            <label className="mb-3 block rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              Импорт PDF
              <input className="mt-2 block text-sm" type="file" accept=".pdf" onChange={(event) => importPdf(event.target.files?.[0] || null)} />
            </label>
            <ProfileFormView form={form} setForm={setForm} onSave={saveProfile} />
          </div>
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <h2 className="mb-3 font-medium text-gray-900">Профили поиска</h2>
            <div className="mb-3 space-y-2">
              {filteredSearchProfiles.length ? filteredSearchProfiles.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{item.keywords} · area {item.area}</span>
                  <button onClick={() => deleteSearchProfile(item.id)} className="text-red-600">Удалить</button>
                </div>
              )) : <div className="text-sm text-gray-500">Нет профилей поиска</div>}
            </div>
            <div className="flex gap-2">
              <input value={searchKeywords} onChange={(e) => setSearchKeywords(e.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Ключевые слова" />
              <input value={searchArea} onChange={(e) => setSearchArea(e.target.value)} className="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <button onClick={addSearchProfile} className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white">Добавить</button>
            </div>
          </div>
        </section>
      ) : null}

      {letter ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setLetter(null)}>
          <div className="w-full max-w-2xl rounded-md bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900">{letter.title}</h2>
            <a className="mt-1 block text-sm text-orange-600" href={letter.url} target="_blank" rel="noreferrer">{letter.url}</a>
            <textarea className="mt-4 min-h-64 w-full rounded-md border border-gray-200 p-3 text-sm" value={letter.cover_letter} onChange={(e) => setLetter({ ...letter, cover_letter: e.target.value })} />
            <div className="mt-4 flex justify-end">
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white" onClick={() => setLetter(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button onClick={props.onClick} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm ${props.active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
      {props.icon}
      {props.label}
    </button>
  );
}

function Select(props: { value: string | number; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select value={props.value} onChange={(event) => props.onChange(event.target.value)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
      {props.children}
    </select>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">{text}</div>;
}

function Flag({ label, active, warn }: { label: string; active: boolean; warn?: boolean }) {
  return (
    <span className={`inline-flex h-6 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${active ? (warn ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700') : 'bg-gray-100 text-gray-400'}`}>
      {label}
    </span>
  );
}

function VacanciesTable(props: { items: Vacancy[]; onLetter: (id: string) => void; onHide: (id: string) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!props.items.length) return <Empty text="Нет вакансий по выбранным фильтрам" />;

  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
      <table className="min-w-[1080px] w-full border-collapse text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
          <tr>
            <th className="px-3 py-3">Вакансия</th>
            <th className="px-3 py-3">ЗП</th>
            <th className="px-3 py-3">Флаги</th>
            <th className="px-3 py-3">Формат работы</th>
            <th className="px-3 py-3">Занятость</th>
            <th className="px-3 py-3">Опыт</th>
            <th className="px-3 py-3">Скиллы</th>
            <th className="px-3 py-3">Скор</th>
            <th className="px-3 py-3">Статус</th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => {
            const expanded = expandedId === item.vacancy_id;
            return (
              <tr key={item.vacancy_id} className="border-t border-gray-100 align-top">
                <td className="max-w-xs px-3 py-3">
                  <a className="font-medium text-gray-900 hover:text-orange-600" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                  <div className="mt-1 text-xs text-gray-500">{item.employer}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a className="text-xs font-medium text-orange-600 hover:text-orange-700" href={item.url} target="_blank" rel="noreferrer">Открыть на HH</a>
                    {item.description ? (
                      <button
                        onClick={() => setExpandedId(expanded ? null : item.vacancy_id)}
                        className="text-xs font-medium text-gray-600 hover:text-gray-900"
                      >
                        {expanded ? 'Скрыть описание' : 'Показать описание'}
                      </button>
                    ) : null}
                  </div>
                  {item.score_reason ? <div className="mt-2 text-xs italic text-gray-500">{item.score_reason}</div> : null}
                  {expanded && item.description ? (
                    <div className="mt-3 max-h-80 overflow-y-auto whitespace-pre-line rounded-md bg-gray-50 p-3 text-xs leading-5 text-gray-700">
                      {item.description}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3">{item.salary_text || 'не указана'}</td>
                <td className="space-x-1 px-3 py-3">
                  <Flag label="₽" active={item.flags.has_salary} />
                  <Flag label="R" active={item.flags.remote} />
                  <Flag label="½" active={item.flags.part_time} warn />
                </td>
                <td className="px-3 py-3">{item.work_format || 'не указан'}</td>
                <td className="px-3 py-3">{item.employment || '-'}</td>
                <td className="px-3 py-3">{item.experience || '-'}</td>
                <td className="max-w-xs px-3 py-3 text-xs text-gray-600">{item.key_skills.slice(0, 8).join(', ') || '-'}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${scoreClass(item.score)}`}>{item.score ?? '-'}</span></td>
                <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  {item.status !== 'hidden' && item.status !== 'applied' ? (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => props.onLetter(item.vacancy_id)} className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-800">Письмо</button>
                      <button onClick={() => props.onHide(item.vacancy_id)} className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">Скрыть</button>
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProfileFormView(props: { form: ProfileForm; setForm: (form: ProfileForm) => void; onSave: () => void }) {
  const { form, setForm } = props;
  const update = (key: keyof ProfileForm, value: string) => setForm({ ...form, [key]: value });

  return <ResumeProfileFields form={form} update={update} onSave={props.onSave} />;

  return (
    <div className="grid gap-3">
      <Field label="Название резюме" value={form.name} onChange={(value) => update('name', value)} />
      <Field label="Должность" value={form.position} onChange={(value) => update('position', value)} />
      <Field label="Навыки" value={form.skills} onChange={(value) => update('skills', value)} />
      <label className="block text-sm">
        <span className="mb-1 block text-gray-600">Опыт</span>
        <textarea value={form.experience_summary} onChange={(event) => update('experience_summary', event.target.value)} className="min-h-32 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ожидаемая ЗП" value={form.salary_expected} onChange={(value) => update('salary_expected', value)} type="number" />
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">Тон письма</span>
          <select value={form.cover_letter_tone} onChange={(event) => update('cover_letter_tone', event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="formal">Деловой</option>
            <option value="friendly">Дружелюбный</option>
          </select>
        </label>
      </div>
      <Field label="Стоп-слова" value={form.stop_words} onChange={(value) => update('stop_words', value)} />
      <button onClick={props.onSave} className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm text-white">Сохранить резюме</button>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-gray-600">{props.label}</span>
      <input type={props.type || 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
    </label>
  );
}

function ResumeProfileFields(props: {
  form: ProfileForm;
  update: (key: keyof ProfileForm, value: string) => void;
  onSave: () => void;
}) {
  const { form, update } = props;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Название резюме" value={form.name} onChange={(value) => update('name', value)} />
        <Field label="Желаемая должность" value={form.position} onChange={(value) => update('position', value)} />
        <Field label="Телефон" value={form.contact_phone} onChange={(value) => update('contact_phone', value)} />
        <Field label="Email" value={form.contact_email} onChange={(value) => update('contact_email', value)} type="email" />
        <Field label="Город" value={form.location} onChange={(value) => update('location', value)} />
        <Field label="Гражданство / разрешение" value={form.citizenship} onChange={(value) => update('citizenship', value)} />
        <Field label="Формат работы" value={form.work_format} onChange={(value) => update('work_format', value)} />
        <Field label="Тип занятости" value={form.employment_type} onChange={(value) => update('employment_type', value)} />
        <Field label="Готовность к командировкам" value={form.travel_readiness} onChange={(value) => update('travel_readiness', value)} />
        <Field label="Ожидаемая ЗП" value={form.salary_expected} onChange={(value) => update('salary_expected', value)} type="number" />
      </div>

      <Field label="Навыки" value={form.skills} onChange={(value) => update('skills', value)} />

      <label className="block text-sm">
        <span className="mb-1 block text-gray-600">Опыт и достижения</span>
        <textarea value={form.experience_summary} onChange={(event) => update('experience_summary', event.target.value)} className="min-h-40 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">Тон письма</span>
          <select value={form.cover_letter_tone} onChange={(event) => update('cover_letter_tone', event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="formal">Деловой</option>
            <option value="friendly">Дружелюбный</option>
          </select>
        </label>
        <Field label="Языки" value={form.languages} onChange={(value) => update('languages', value)} />
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-gray-600">Образование</span>
        <textarea value={form.education} onChange={(event) => update('education', event.target.value)} className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-gray-600">Курсы</span>
        <textarea value={form.courses} onChange={(event) => update('courses', event.target.value)} className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-gray-600">Обо мне</span>
        <textarea value={form.about} onChange={(event) => update('about', event.target.value)} className="min-h-32 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>

      <Field label="Стоп-слова" value={form.stop_words} onChange={(value) => update('stop_words', value)} />
      <button onClick={props.onSave} className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm text-white">Сохранить резюме</button>
    </div>
  );
}
