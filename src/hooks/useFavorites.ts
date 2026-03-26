import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'

const MAX_FAVORITES = 50
const MAX_FAVORITES_FREE = 10

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
        .select('category_id')
        .eq('user_id', userId!)

      if (!cancelled) {
        if (error) {
          // Silently ignore 404 (table not found / schema cache stale)
          if (error.code !== 'PGRST204' && !error.message?.includes('404')) {
            console.error('Failed to fetch favorites:', error.message)
          }
        } else {
          setFavoriteIds(new Set((data ?? []).map((d) => d.category_id)))
        }
        setLoading(false)
      }
    }

    fetchFavorites()
    return () => { cancelled = true }
  }, [userId])

  const isFavorite = useCallback(
    (categoryId: string) => favoriteIds.has(categoryId),
    [favoriteIds],
  )

  const toggle = useCallback(
    async (categoryId: string) => {
      if (!userId) return

      if (favoriteIds.has(categoryId)) {
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          next.delete(categoryId)
          return next
        })
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', userId)
          .eq('category_id', categoryId)
        if (error && error.code !== 'PGRST204' && !error.message?.includes('404')) {
          console.error('Failed to remove favorite:', error.message)
          setFavoriteIds((prev) => new Set(prev).add(categoryId))
        }
      } else {
        const limit = isSupporter ? MAX_FAVORITES : MAX_FAVORITES_FREE
        if (favoriteIds.size >= limit) return
        setFavoriteIds((prev) => new Set(prev).add(categoryId))
        const { error } = await supabase
          .from('user_favorites')
          .insert({ user_id: userId, category_id: categoryId })
        if (error && error.code !== 'PGRST204' && !error.message?.includes('404')) {
          console.error('Failed to add favorite:', error.message)
          setFavoriteIds((prev) => {
            const next = new Set(prev)
            next.delete(categoryId)
            return next
          })
        }
      }
    },
    [userId, isSupporter, favoriteIds],
  )

  return { favoriteIds, isFavorite, toggle, loading, isSupporter }
}
