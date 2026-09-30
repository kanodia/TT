import { common } from './common';
import { diner } from './diner';
import { field } from './field';
import { partner } from './partner';

// All user-facing strings live here (spec 11.1, 11.6). `{brand}` and other `{vars}` are filled in
// at render time, so a rebrand or a new language needs no screen changes.
export const en = { ...common.en, ...diner.en, ...partner.en, ...field.en };
export type MessageKey = keyof typeof en;
export type Lang = 'en' | 'hi';

const hi: Partial<Record<MessageKey, string>> = { ...common.hi, ...diner.hi, ...partner.hi, ...field.hi };
const dictionaries: Record<Lang, Partial<Record<MessageKey, string>>> = { en, hi };

export type Vars = Record<string, string | number | null | undefined>;

/** Looks up a message; Hindi falls back to English for anything not yet translated. */
export function translate(lang: Lang, key: MessageKey, vars?: Vars) {
  const template = dictionaries[lang][key] ?? en[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (m, name: string) => (vars[name] == null ? m : String(vars[name]))) : template;
}

/** Plural helper: picks `key.one` / `key.other` by count. */
export function plural(lang: Lang, base: string, count: number, vars?: Vars) {
  const key = `${base}.${count === 1 ? 'one' : 'other'}` as MessageKey;
  return translate(lang, key, { count, ...vars });
}
