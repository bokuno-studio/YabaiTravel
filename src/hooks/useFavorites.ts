import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'

const MAX_FAVORITES = 50
const MAX_FAVORITES_FREE = 10

export function useFavorites() {
  const { user, isSupporter } = useAuth()
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [goingIds, setGoingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const userId = useMemo(() => user?.id ?? null, [user])

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    async function fetchFavorites() {
      setLoading(true)
      const { data, error } = await supabase
        .from('user_favorites')
        .select('category_id, status')
        .eq('user_id', userId!)

      if (!cancelled) {
        if (error) {
          // Silently ignore 404 (table not found / schema cache stale)
          if (error.code !== 'PGRST204' && !error.message?.includes('404')) {
            console.error('Failed to fetch favorites:', error.message)
          }
        } else {
          const favorites = new Set<string>()
          const going = new Set<string>()
          ;(data ?? []).forEach((item) => {
            if (item.status === 'going') {
              going.add(item.category_id)
            } else {
              favorites.add(item.category_id)
            }
          })
          setFavoriteIds(favorites)
          setGoingIds(going)
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

  const isGoing = useCallback(
    (categoryId: string) => goingIds.has(categoryId),
    [goingIds],
  )

  const toggle = useCallback(
    async (categoryId: string, status: 'favorite' | 'going' = 'favorite') => {
      if (!userId) return

      const targetSet = status === 'going' ? goingIds : favoriteIds
      const setTargetSet = status === 'going' ? setGoingIds : setFavoriteIds

      if (targetSet.has(categoryId)) {
        setTargetSet((prev) => {
          const next = new Set(prev)
          next.delete(categoryId)
          return next
        })
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', userId)
          .eq('category_id', categoryId)
          .eq('status', status)
        if (error && error.code !== 'PGRST204' && !error.message?.includes('404')) {
          console.error(`Failed to remove ${status}:`, error.message)
          setTargetSet((prev) => new Set(prev).add(categoryId))
        }
      } else {
        const limit = isSupporter ? MAX_FAVORITES : MAX_FAVORITES_FREE
        if (targetSet.size >= limit) return
        setTargetSet((prev) => new Set(prev).add(categoryId))
        const { error } = await supabase
          .from('user_favorites')
          .insert({ user_id: userId, category_id: categoryId, status })
        if (error && error.code !== 'PGRST204' && !error.message?.includes('404')) {
          console.error(`Failed to add ${status}:`, error.message)
          setTargetSet((prev) => {
            const next = new Set(prev)
            next.delete(categoryId)
            return next
          })
        }
      }
    },
    [userId, isSupporter, favoriteIds, goingIds],
  )

  return { favoriteIds, goingIds, isFavorite, isGoing, toggle, loading, isSupporter }
}
