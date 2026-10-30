import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'

import { queryClient } from './lib/queries'
import { useTheme } from './lib/theme'
import { router } from './router'
import './styles.css'

/** Avisos no mesmo tema do sistema, com o raio e a sombra do design system. */
function Toasts() {
  const theme = useTheme()
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{ style: { borderRadius: 12, fontFamily: 'var(--font-sans)', boxShadow: 'var(--shadow-pop)' } }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* `user`: quem pediu menos movimento no sistema operacional não recebe animações. */}
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toasts />
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
)
