// Offline demo data so the app is fully usable without a TMDB key.
// [title, year, genres, director, runtime, vote]
const FILMS = [
  ['Parasite', 2019, ['Comedy', 'Thriller', 'Drama'], 'Bong Joon-ho', 133, 8.5],
  ['Inception', 2010, ['Action', 'Science Fiction', 'Adventure'], 'Christopher Nolan', 148, 8.4],
  ['Interstellar', 2014, ['Adventure', 'Drama', 'Science Fiction'], 'Christopher Nolan', 169, 8.4],
  ['The Dark Knight', 2008, ['Drama', 'Action', 'Crime', 'Thriller'], 'Christopher Nolan', 152, 8.5],
  ['Lady Bird', 2017, ['Comedy', 'Drama'], 'Greta Gerwig', 94, 7.0],
  ['Little Women', 2019, ['Drama', 'Romance'], 'Greta Gerwig', 135, 7.9],
  ['Whiplash', 2014, ['Drama', 'Music'], 'Damien Chazelle', 107, 8.4],
  ['La La Land', 2016, ['Comedy', 'Drama', 'Romance', 'Music'], 'Damien Chazelle', 128, 7.9],
  ['The Grand Budapest Hotel', 2014, ['Comedy', 'Drama'], 'Wes Anderson', 100, 8.0],
  ['Moonrise Kingdom', 2012, ['Comedy', 'Drama', 'Romance'], 'Wes Anderson', 94, 7.7],
  ['Get Out', 2017, ['Horror', 'Mystery', 'Thriller'], 'Jordan Peele', 104, 7.6],
  ['Hereditary', 2018, ['Horror', 'Mystery', 'Thriller'], 'Ari Aster', 127, 7.3],
  ['Spirited Away', 2001, ['Animation', 'Family', 'Fantasy'], 'Hayao Miyazaki', 125, 8.5],
  ['Eternal Sunshine of the Spotless Mind', 2004, ['Science Fiction', 'Drama', 'Romance'], 'Michel Gondry', 108, 8.1],
  ['Everything Everywhere All at Once', 2022, ['Action', 'Adventure', 'Science Fiction', 'Comedy'], 'Daniel Kwan', 139, 7.8],
  ['Arrival', 2016, ['Drama', 'Science Fiction', 'Mystery'], 'Denis Villeneuve', 116, 7.6],
  ['Blade Runner 2049', 2017, ['Science Fiction', 'Drama'], 'Denis Villeneuve', 164, 7.6],
  ['Prisoners', 2013, ['Drama', 'Crime', 'Thriller'], 'Denis Villeneuve', 153, 8.1],
  ['Knives Out', 2019, ['Comedy', 'Crime', 'Mystery'], 'Rian Johnson', 131, 7.8],
  ['Superbad', 2007, ['Comedy'], 'Greg Mottola', 113, 7.2],
  ['Paddington 2', 2017, ['Family', 'Comedy', 'Adventure'], 'Paul King', 104, 7.7],
  ['Before Sunrise', 1995, ['Drama', 'Romance'], 'Richard Linklater', 101, 7.9],
  ['Past Lives', 2023, ['Drama', 'Romance'], 'Celine Song', 106, 7.8],
  ['Zodiac', 2007, ['Crime', 'Mystery', 'Thriller'], 'David Fincher', 157, 7.7],
  ['Se7en', 1995, ['Crime', 'Mystery', 'Thriller'], 'David Fincher', 127, 8.4],
  ['Gone Girl', 2014, ['Mystery', 'Thriller', 'Drama'], 'David Fincher', 149, 7.9],
  ['Mad Max: Fury Road', 2015, ['Action', 'Adventure', 'Science Fiction'], 'George Miller', 120, 7.6],
  ['Saving Private Ryan', 1998, ['Drama', 'History', 'War'], 'Steven Spielberg', 169, 8.2],
  ['Amélie', 2001, ['Comedy', 'Romance'], 'Jean-Pierre Jeunet', 122, 7.9],
  ['Princess Mononoke', 1997, ['Adventure', 'Fantasy', 'Animation'], 'Hayao Miyazaki', 134, 8.3],
  ['Palm Springs', 2020, ['Comedy', 'Romance', 'Science Fiction'], 'Max Barbakow', 90, 7.4],
  ['Coco', 2017, ['Animation', 'Family', 'Fantasy', 'Music'], 'Lee Unkrich', 105, 8.2],
  ['Drive', 2011, ['Drama', 'Crime', 'Thriller'], 'Nicolas Winding Refn', 100, 7.6],
  ['Portrait of a Lady on Fire', 2019, ['Drama', 'Romance', 'History'], 'Céline Sciamma', 122, 8.1],
  ['The Social Network', 2010, ['Drama', 'History'], 'David Fincher', 121, 7.4],
  ['Oldboy', 2003, ['Drama', 'Thriller', 'Mystery'], 'Park Chan-wook', 120, 8.3],
  ['Booksmart', 2019, ['Comedy'], 'Olivia Wilde', 102, 7.0],
];

const toMeta = ([title, year, genres, director, runtime, vote], i) => ({
  key: `${title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim()}|${year}`,
  tmdbId: null, title, year, genres, directors: [director], runtime, vote, poster: null, overview: '', providers: null,
});

export const DEMO_CATALOG = FILMS.map(toMeta);

// The first 16 films are "already watched"; the demo user loves sci-fi/thrillers and Nolan/Villeneuve-style films.
const DEMO_RATINGS = [5, 5, 4.5, 5, 3, 3.5, 4.5, 3.5, 4, 3, 4, 2.5, 4.5, 5, 4.5, 4];
export function demoLibrary() {
  const movies = {};
  DEMO_CATALOG.slice(0, DEMO_RATINGS.length).forEach((meta, i) => {
    movies[meta.key] = { key: meta.key, title: meta.title, year: meta.year, rating: DEMO_RATINGS[i],
      watchedDate: null, sources: ['demo'], meta };
  });
  return movies;
}
