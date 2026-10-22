// Cisum web player v0.8.0 - Home: shelves (favorite radios, album lists) in the order and visibility chosen in Settings.
import { Button } from '@mui/material'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAlbumList } from '../api/library'
import { AlbumCard, Shelf, EmptyState } from '../components/Cards'
import { getRadios } from '../api/radio'
import { useRadioFavorites, useHomeShelves } from '../store/preferences'
import { RadioCard } from '../components/Radio'

// "Show all" target of each album shelf (Played recently has no matching sort)
const MORE = {
  newest: '/albums?sort=recently_added',
  frequent: '/albums?sort=play_count',
  random: '/albums?sort=random',
}

function AlbumShelf({ type, title }) {
  const { data = [] } = useQuery({ queryKey: ['albumList', type], queryFn: () => getAlbumList(type, 18) })
  if (!data.length) return null
  const more = MORE[type]
  return (
    <Shelf title={title} action={more && <Button component={Link} to={more}>Show all</Button>}>
      {data.map((a) => <AlbumCard key={a.id} album={a} />)}
    </Shelf>
  )
}

function FavoriteRadios({ title }) {
  const [isFavorite, , ids] = useRadioFavorites()
  const { data = [] } = useQuery({ queryKey: ['radios'], queryFn: getRadios, enabled: ids.length > 0 })
  const radios = data.filter((r) => isFavorite(r.id))
  if (!radios.length) return null
  return (
    <Shelf title={title} action={<Button component={Link} to="/radios">All radios</Button>}>
      {radios.map((r) => <RadioCard key={r.id} radio={r} />)}
    </Shelf>
  )
}

export default function Home() {
  const [shelves] = useHomeShelves()
  const { data: newest, isSuccess } = useQuery({ queryKey: ['albumList', 'newest'], queryFn: () => getAlbumList('newest', 18) })
  if (isSuccess && !newest.length) {
    return (
      <EmptyState title="Your library is empty">
        Add music files to the server's music folder. Cisum scans it automatically and albums appear here.
      </EmptyState>
    )
  }
  const visible = shelves.filter((s) => s.visible)
  if (!visible.length) {
    return (
      <EmptyState title="All home lists are hidden">
        Choose the lists to show here in <Link to="/settings">Settings</Link>.
      </EmptyState>
    )
  }
  return (
    <div style={{ paddingTop: 16 }}>
      {visible.map((s) => (s.id === 'radios'
        ? <FavoriteRadios key={s.id} title={s.title} />
        : <AlbumShelf key={s.id} type={s.id} title={s.title} />))}
    </div>
  )
}
