export interface Named { id: string; name: string; aliases: string[]; context?: string[] }
export function distance(a: string, b: string): number;
export function tolerance(s: string): number;
export function resolve<T extends Named>(input: string, entities: T[]): T | null;
export function resolveFor<T extends Named>(input: string, entities: T[], right: Iterable<string>): T | null;
