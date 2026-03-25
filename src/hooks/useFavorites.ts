import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'

const MAX_FAVORITES = 50

export function useFavorites() {
  const { user, isSupporter } = useAuth()
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const userId = useMemo(() => user?.id ?? null, [user])

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    async function fetchFavorites() {
      setLoading(true)
      const { data, error } = await supabase
        .from('user_favorites')
        .select('event_id')
        .eq('user_id', user!.id)

      if (!cancelled) {
        if (error) {
          console.error('Failed to fetch favorites:', error.message)
        } else {
          setFavoriteIds(new Set((data ?? []).map((d) => d.event_id)))
        }
        setLoading(false)
      }
    }

    fetchFavorites()
    return () => { cancelled = true }
  }, [user])

  const isFavorite = useCallback(
    (eventId: string) => favoriteIds.has(eventId),
    [favoriteIds],
  )

  const toggle = useCallback(
    async (eventId: string) => {
      if (!user || !isSupporter) return

      if (favoriteIds.has(eventId)) {
        // Remove
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          next.delete(eventId)
          return next
        })
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('event_id', eventId)
        if (error) {
          console.error('Failed to remove favorite:', error.message)
          // Revert on error
          setFavoriteIds((prev) => new Set(prev).add(eventId))
        }
      } else {
        // Check limit
        if (favoriteIds.size >= MAX_FAVORITES) return

        // Add
        setFavoriteIds((prev) => new Set(prev).add(eventId))
        const { error } = await supabase
          .from('user_favorites')
          .insert({ user_id: user.id, event_id: eventId })
        if (error) {
          console.error('Failed to add favorite:', error.message)
          // Revert on error
          setFavoriteIds((prev) => {
            const next = new Set(prev)
            next.delete(eventId)
            return next
          })
        }
      }
    },
    [user, isSupporter, favoriteIds],
  )

  return { favoriteIds, isFavorite, toggle, loading, isSupporter }
}
