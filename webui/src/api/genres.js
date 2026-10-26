// Cisum web player v0.11.6 - Genre queries and links from a genre name.
// Subsonic gives genre names only; the genre page uses the server's genre id. The genre list (small,
// cached) maps a name to its id, so any genre shown in the player can link to its page.
import { useQuery } from '@tanstack/react-query'
import { getGenres, getGenre } from './library'

export const genresQuery = { queryKey: ['genres'], queryFn: () => getGenres(), staleTime: 5 * 60_000 }
export const genreQuery = (id) => ({ queryKey: ['genre', id], queryFn: () => getGenre(id) })

/** Returns idOf(name): the genre id for a name (case-insensitive), or undefined while unknown. */
export function useGenreIds() {
  const { data } = useQuery(genresQuery)
  const byName = new Map((data || []).map((g) => [g.name.toLowerCase(), g.id]))
  return (name) => byName.get(String(name).toLowerCase())
}
