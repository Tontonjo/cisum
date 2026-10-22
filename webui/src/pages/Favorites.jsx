// Cisum web player v0.6.0 - Favorite songs, albums and artists, each tab with its own remembered sort.
import { useState } from 'react'
import { Tabs, Tab, Box } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { getStarred, FAVORITE_SONG_SORTS, FAVORITE_ALBUM_SORTS, FAVORITE_ARTIST_SORTS, sortDetail } from '../api/library'
import { useClientSort } from '../utils/sort'
import { PageTitle, CardGrid, AlbumCard, ArtistCard, EmptyState } from '../components/Cards'
import SortChips from '../components/SortChips'
import TrackList from '../components/TrackList'

const TABS = {
  songs: { label: 'Songs', options: FAVORITE_SONG_SORTS },
  albums: { label: 'Albums', options: FAVORITE_ALBUM_SORTS },
  artists: { label: 'Artists', options: FAVORITE_ARTIST_SORTS },
}

export default function Favorites() {
  const [tab, setTab] = useState('songs')
  const { data } = useQuery({ queryKey: ['starred'], queryFn: getStarred })
  const { options } = TABS[tab]
  const { sort, onSort, sorted: items } = useClientSort(`favorites.${tab}`, options, 'starred', data?.[tab])
  return (
    <>
      <PageTitle>Favorites</PageTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        {Object.entries(TABS).map(([key, t]) => (
          <Tab key={key} value={key} label={`${t.label}${data ? ` (${data[key].length})` : ''}`} />
        ))}
      </Tabs>
      {data && !items.length && (
        <EmptyState title={`No favorite ${tab} yet`}>Tap the heart next to any song, album or artist to keep it here.</EmptyState>
      )}
      {items.length > 1 && <SortChips options={options} value={sort} onChange={onSort} />}
      <Box>
        {tab === 'songs' && <TrackList tracks={items} showCover showAlbum detail={options[sort.key].detail} />}
        {tab === 'albums' && (
          <CardGrid>
            {items.map((a) => {
              const detail = sortDetail(options, sort, a)
              return <AlbumCard key={a.id} album={a} subtitle={detail && [a.artist, detail].filter(Boolean).join(', ')} />
            })}
          </CardGrid>
        )}
        {tab === 'artists' && (
          <CardGrid min={150}>{items.map((a) => <ArtistCard key={a.id} artist={a} detail={sortDetail(options, sort, a)} />)}</CardGrid>
        )}
      </Box>
    </>
  )
}
