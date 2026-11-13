// The knowledge base as the site sees it: public/data/countries.json (approved facts only, plus river crossings that
// one source names, marked "also": they count as right answers but are never shown as THE answer).

/** `context`: names that only count when this entity is a right answer ("Congo" for DR Congo). */
export interface Entity { id: string; name: string; aliases: string[]; context?: string[] }
export interface Country extends Entity { qid: string; iso2: string; num: string; flag: string; ll: [number, number]; tier: string }
export interface City extends Entity { country: string; ll?: [number, number] }
export interface Language extends Entity { sample?: string; cluster?: string }
export interface Peak extends Entity { m: number; ll: [number, number] }
export interface River extends Entity { km: number }
export type Fact = [subject: string, relation: string, object: string, qualifier?: string];
export interface Relation {
  from: string; to: string; many: boolean; symmetric: boolean; complete: boolean;
  map: 'administrative' | 'natural'; forward: string; reverse: string | null;
}
export interface KBData {
  edition: string;
  sources: string[];
  relations: Record<string, Relation>;
  countries: Country[];
  cities: City[];
  languages: Language[];
  peaks: Peak[];
  rivers: River[];
  facts: Fact[];
  confusables: [string, string][];
}

export const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'] as const;

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value); else map.set(key, [value]);
}

export class Knowledge {
  readonly edition: string;
  readonly sources: string[];
  readonly countries: Country[];
  readonly cities: City[];
  readonly languages: Language[];
  readonly peaks: Peak[];
  readonly rivers: River[];
  private readonly byId = new Map<string, Entity>();
  private readonly fwd = new Map<string, Fact[]>();
  private readonly back = new Map<string, Fact[]>();

  constructor(data: KBData) {
    this.edition = data.edition;
    this.sources = data.sources;
    this.countries = data.countries;
    this.cities = data.cities;
    this.languages = data.languages;
    this.peaks = data.peaks ?? [];
    this.rivers = data.rivers ?? [];
    for (const e of [...data.countries, ...data.cities, ...data.languages, ...this.peaks, ...this.rivers]) this.byId.set(e.id, e);
    for (const f of data.facts) {
      push(this.fwd, `${f[0]}|${f[1]}`, f);
      push(this.back, `${f[2]}|${f[1]}`, f);
    }
  }

  name(id: string): string { return this.byId.get(id)?.name ?? id; }
  get<T extends Entity = Entity>(id: string): T | undefined { return this.byId.get(id) as T | undefined; }
  country(id: string): Country | undefined { return this.byId.get(id) as Country | undefined; }

  out(subject: string, relation: string): Fact[] { return this.fwd.get(`${subject}|${relation}`) ?? []; }
  in(object: string, relation: string): Fact[] { return this.back.get(`${object}|${relation}`) ?? []; }

  /** Every approved capital, including a seat of government that is "also accepted" as an answer. */
  capitals(country: string): string[] { return this.out(country, 'capital').map(f => f[2]); }
  /** Capitals that may be shown as THE capital (no "also accepted" qualifier). */
  mainCapitals(country: string): string[] {
    return this.out(country, 'capital').filter(f => !(f[3] ?? '').includes('also accepted')).map(f => f[2]);
  }
  languagesOf(country: string): string[] { return this.out(country, 'official_language').map(f => f[2]); }
  neighbours(country: string): string[] {
    return [...this.out(country, 'borders').map(f => f[2]), ...this.in(country, 'borders').map(f => f[0])];
  }
  continent(country: string): string | undefined { return this.out(country, 'continent')[0]?.[2]; }

  /** The language and the languages too close to tell apart in writing (Serbian, Croatian, Bosnian...). */
  cluster(language: string): string[] {
    const c = this.get<Language>(language)?.cluster;
    return c ? this.languages.filter(l => l.cluster === c).map(l => l.id) : [language];
  }
  /** Countries where the language is official, or (spoken = true) also widely spoken. */
  whereSpoken(language: string, spoken = true): string[] {
    const ids = new Set(this.in(language, 'official_language').map(f => f[0]));
    if (spoken) for (const f of this.in(language, 'spoken_language')) ids.add(f[0]);
    return [...ids];
  }

  highestPoint(country: string): string | undefined { return this.out(country, 'highest_point')[0]?.[2]; }
  /** Countries whose highest point the peak is (Everest: Nepal and China). */
  peakCountries(peak: string): string[] { return this.in(peak, 'highest_point').map(f => f[0]); }
  /** Countries a river flows through: confirmed ones, or with `also` the ones a single source names too. */
  riverCountries(river: string, also = false): string[] {
    return this.out(river, 'flows_through').filter(f => also || f[3] !== 'also').map(f => f[2]);
  }
}
