import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import {
  Box, Paper, TextField, Button, Typography, Alert, CircularProgress,
} from '@mui/material'
import { useAuth } from '../auth/AuthContext'

export default function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate('/')
    } catch {
      setErr('Incorrect email or password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #141414 0%, #7d1c1b 100%)',
      }}
    >
      <Paper sx={{ p: 4, width: 380, maxWidth: '90vw' }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Sieger</Typography>
        <Typography
          variant="caption"
          sx={{ display: 'block', color: 'primary.main', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}
        >
          Partnering Progress
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, mt: 0.25 }}>
          Sales Intelligence Platform
        </Typography>
        <form onSubmit={submit}>
          <TextField
            label="Email"
            fullWidth
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            autoComplete="username"
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {err && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {err}
            </Alert>
          )}
          <Button type="submit" fullWidth variant="contained" size="large" sx={{ mt: 3 }} disabled={busy}>
            {busy ? <CircularProgress size={22} color="inherit" /> : 'Sign In'}
          </Button>
        </form>
      </Paper>
    </Box>
  )
}
