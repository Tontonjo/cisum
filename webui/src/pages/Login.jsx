// Cisum web player v0.1.0 - Login and first-run admin creation.
import { useState } from 'react'
import { Box, Button, TextField, Typography, Alert, useTheme } from '@mui/material'
import { login } from '../api/client'
import config from '../config'
import { BrandMark } from '../components/Brand'

export default function Login({ onLogin }) {
  const theme = useTheme()
  const firstTime = config.firstTime
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (firstTime && password !== confirm) {
      setError('The two passwords are different')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onLogin(await login(username, password, firstTime))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2, bgcolor: theme.m3.surfaceContainerLowest }}>
      <Box
        component="form"
        onSubmit={submit}
        sx={{
          width: '100%',
          maxWidth: 400,
          p: { xs: 3, sm: 5 },
          borderRadius: 7,
          bgcolor: theme.m3.surfaceContainer,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <BrandMark size={44} />
          <Typography variant="h3" component="h1">
            Cisum
          </Typography>
        </Box>
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          {firstTime ? 'Create the administrator account to get started.' : 'Sign in to your music.'}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        <TextField
          label="Password"
          type="password"
          autoComplete={firstTime ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {firstTime && (
          <TextField label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        )}
        <Button type="submit" variant="contained" size="large" disabled={busy} sx={{ mt: 1 }}>
          {firstTime ? 'Create account' : 'Sign in'}
        </Button>
      </Box>
    </Box>
  )
}
