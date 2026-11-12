// The knowledge base as the site sees it: public/data/countries.json (approved facts only).

export interface Entity { id: string; name: string; aliases: string[] }
export interface Country extends Entity { qid: string; iso2: string; num: string; flag: string; ll: [number, number]; tier: string }
export interface City extends Entity { country: string }
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
  languages: Entity[];
  facts: Fact[];
  confusables: [string, string][];
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value); else map.set(key, [value]);
}

export class Knowledge {
  readonly edition: string;
  readonly countries: Country[];
  readonly cities: City[];
  readonly languages: Entity[];
  private readonly relations: Record<string, Relation>;
  private readonly byId = new Map<string, Entity>();
  private readonly fwd = new Map<string, Fact[]>();
  private readonly back = new Map<string, Fact[]>();

  constructor(data: KBData) {
    this.edition = data.edition;
    this.relations = data.relations;
    this.countries = data.countries;
    this.cities = data.cities;
    this.languages = data.languages;
    for (const e of [...data.countries, ...data.cities, ...data.languages]) this.byId.set(e.id, e);
    for (const f of data.facts) {
      push(this.fwd, `${f[0]}|${f[1]}`, f);
      push(this.back, `${f[2]}|${f[1]}`, f);
    }
  }

  name(id: string): string { return this.byId.get(id)?.name ?? id; }
  country(id: string): Country | undefined { return this.countries.find(c => c.id === id); }

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

  /** Question wording from relations.yaml, e.g. "Capital of {s}?" */
  wording(relation: string, direction: 'forward' | 'reverse', vars: { s?: string; o?: string }): string {
    const template = this.relations[relation]?.[direction] ?? '';
    return template.replace('{s}', vars.s ?? '').replace('{o}', vars.o ?? '');
  }
}
