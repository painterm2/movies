// Moods steer recommendations on top of personal taste. `want` genres add, `avoid` genres
// subtract, runtime bounds are soft limits. TMDB genre names are used throughout.
export const MOODS = [
  { id: 'cozy', label: 'Cozy', emoji: '🛋️', want: ['Comedy', 'Family', 'Romance', 'Animation', 'Music'], avoid: ['Horror', 'War', 'Crime'] },
  { id: 'laugh', label: 'Need a laugh', emoji: '😂', want: ['Comedy'], avoid: ['Horror', 'War', 'Drama'] },
  { id: 'cry', label: 'Want to cry', emoji: '😭', want: ['Drama', 'Romance', 'War'], avoid: ['Comedy', 'Horror'] },
  { id: 'mind', label: 'Mind-bending', emoji: '🌀', want: ['Science Fiction', 'Mystery', 'Thriller'], avoid: ['Family', 'Romance'] },
  { id: 'thrill', label: 'Edge of my seat', emoji: '😰', want: ['Thriller', 'Crime', 'Mystery', 'Horror'], avoid: ['Family', 'Animation'] },
  { id: 'adventure', label: 'Escape somewhere', emoji: '🗺️', want: ['Adventure', 'Fantasy', 'Science Fiction', 'Action'], avoid: ['Documentary'] },
  { id: 'dark', label: 'Dark & heavy', emoji: '🌑', want: ['Crime', 'Horror', 'Drama', 'Thriller'], avoid: ['Family', 'Comedy', 'Animation'] },
  { id: 'inspire', label: 'Inspired', emoji: '✨', want: ['Drama', 'History', 'Music', 'Documentary'], avoid: ['Horror'] },
  { id: 'date', label: 'Date night', emoji: '🍷', want: ['Romance', 'Comedy', 'Drama'], avoid: ['Horror', 'War'] },
  { id: 'short', label: 'Short & sweet', emoji: '⏱️', want: [], avoid: [], maxRuntime: 100 },
  { id: 'epic', label: 'Settle in (long)', emoji: '🍿', want: ['Adventure', 'History', 'War', 'Fantasy'], avoid: [], minRuntime: 135 },
];

export const GENRE_IDS = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller',
  10752: 'War', 37: 'Western',
};
export const GENRE_NAME_TO_ID = Object.fromEntries(Object.entries(GENRE_IDS).map(([id, n]) => [n, +id]));

export function moodScore(mood, meta) {
  if (!mood) return 0;
  let s = 0;
  for (const g of meta.genres || []) {
    if (mood.want.includes(g)) s += 1;
    if (mood.avoid.includes(g)) s -= 2;
  }
  if (meta.runtime) {
    if (mood.maxRuntime && meta.runtime > mood.maxRuntime) s -= 2;
    if (mood.maxRuntime && meta.runtime <= mood.maxRuntime) s += 1;
    if (mood.minRuntime && meta.runtime < mood.minRuntime) s -= 2;
    if (mood.minRuntime && meta.runtime >= mood.minRuntime) s += 1;
  }
  return s;
}
