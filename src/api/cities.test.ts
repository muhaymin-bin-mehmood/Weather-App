import { describe, expect, it } from 'vitest';
import { isThin, mergeCandidates, type Candidate } from './cities';

const c = (id: string, name: string, cc: string, lat: number, lon: number, population: number): Candidate => ({
  population,
  city: { id, name, country: cc, countryCode: cc, lat, lon },
});

// Real GeoDB answer for "Lahore" with types=CITY (Nov 2026): only the US town.
const geoLahore = [c('geodb:3436378', 'Lahore', 'US', 38.1986, -77.97, 0)];
const omLahore = [
  c('om:1172451', 'Lahore', 'PK', 31.5497, 74.3436, 6_310_888),
  c('om:4769125', 'Lahore', 'US', 38.199, -77.971, 0),
];

describe('GeoDB thin-result merge', () => {
  it('treats a single tiny result as thin', () => {
    expect(isThin(geoLahore)).toBe(true);
  });

  it('keeps a healthy GeoDB list as is', () => {
    const london = [
      c('geodb:1', 'London', 'GB', 51.5, -0.12, 8_799_728),
      c('geodb:2', 'East London', 'ZA', -33, 27.9, 478_676),
      c('geodb:3', 'London', 'CA', 42.98, -81.24, 422_324),
    ];
    expect(isThin(london)).toBe(false);
  });

  it('puts Lahore, Pakistan first and drops the duplicate US entry', () => {
    const merged = mergeCandidates(geoLahore, omLahore);
    expect(merged.map((m) => `${m.name}/${m.countryCode}`)).toEqual(['Lahore/PK', 'Lahore/US']);
    expect(merged[1].id).toBe('geodb:3436378'); // GeoDB's entry wins the tie
  });

  it('treats accented and plain spellings as one place, and dedupes within a source', () => {
    const geo = [
      c('geodb:1', 'Hyderabad', 'PK', 25.39, 68.37, 1_732_693),
      c('geodb:2', 'Hyderabad', 'PK', 25.4, 68.36, 0),
    ];
    const om = [c('om:1', 'Hyderābād', 'PK', 25.39, 68.37, 1_386_330)];
    expect(mergeCandidates(geo, om).map((m) => m.id)).toEqual(['geodb:1']);
  });

  it('names the district when same-named places share a province', () => {
    const om: Candidate[] = [
      { ...c('om:1', 'Hyderabad', 'PK', 31.35, 71.7, 0), district: 'Bhakkar District' },
      { ...c('om:2', 'Hyderabad', 'PK', 29.78, 71.89, 0), district: 'Lodhran District' },
    ].map((x) => ({ ...x, city: { ...x.city, region: 'Punjab' } }));
    expect(mergeCandidates([], om).map((m) => m.region)).toEqual([
      'Bhakkar District, Punjab',
      'Lodhran District, Punjab',
    ]);
  });

  it('returns at most five', () => {
    const many = Array.from({ length: 8 }, (_, i) => c(`om:${i}`, `Town ${i}`, 'PK', i, i, i * 1000));
    expect(mergeCandidates([], many)).toHaveLength(5);
  });
});
