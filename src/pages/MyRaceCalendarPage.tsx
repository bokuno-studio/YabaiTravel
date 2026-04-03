import { useEffect, useState, useRef } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { useFavorites } from '@/hooks/useFavorites'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import SaveButton from '@/components/SaveButton'
import { Calendar, Download, MapPin } from 'lucide-react'
import * as htmlToImage from 'html-to-image'

interface RaceWithEvent {
  id: string
  name: string
  name_en: string
  events: Array<{
    event_date: string | null
    event_date_end?: string | null
    location: string | null
    location_en?: string | null
  }>
}

interface MonthGroup {
  year: number
  month: number
  monthName: string
  races: RaceWithEvent[]
}

export default function MyRaceCalendarPage() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'
  const { user, isSupporter } = useAuth()
  const { isGoing, toggle } = useFavorites()

  const [races, setRaces] = useState<RaceWithEvent[]>([])
  const [loadingRaces, setLoadingRaces] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const calendarRef = useRef<HTMLDivElement>(null)

  // データ取得
  useEffect(() => {
    async function fetchGoingRaces() {
      if (!user?.id) return

      try {
        setLoadingRaces(true)
        const { data, error: queryError } = await supabase
          .from('user_favorites')
          .select(`
            category_id,
            categories (
              id,
              name,
              name_en,
              events (
                event_date,
                event_date_end,
                location,
                location_en
              )
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'going')
          .order('created_at')

        if (queryError) {
          console.error('Failed to fetch going races:', queryError.message)
          setError('レースの読み込みに失敗しました')
          return
        }

        if (!data) {
          setRaces([])
          return
        }

        // data を RaceWithEvent[] に変換
        const racesData: RaceWithEvent[] = data
          .map((item) => {
            const cat = item.categories as { id: string; name: string; name_en: string; events: RaceWithEvent['events'] } | null
            return {
              id: cat?.id ?? '',
              name: cat?.name ?? '',
              name_en: cat?.name_en ?? '',
              events: cat?.events ?? [],
            }
          })
          .filter((race) => race.events && race.events.length > 0)

        setRaces(racesData)
        setError(null)
      } catch (err) {
        console.error('Error fetching going races:', err)
        setError('エラーが発生しました')
      } finally {
        setLoadingRaces(false)
      }
    }

    fetchGoingRaces()
  }, [user?.id])

  // ログイン・Crew会員判定（Hooks呼び出し後に配置）
  if (!user) {
    return <Navigate to={`/${lang}/pricing`} replace />
  }

  if (!isSupporter) {
    return <Navigate to={`/${lang}/pricing`} replace />
  }

  // 月別グループ化
  const groupedRaces = (): MonthGroup[] => {
    const groups: Record<string, MonthGroup> = {}

    races.forEach((race) => {
      race.events.forEach((event) => {
        if (!event.event_date) return

        const date = new Date(event.event_date as string)
        const year = date.getFullYear()
        const month = date.getMonth()

        const monthName = isEn
          ? date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
          : date.toLocaleString('ja-JP', { year: 'numeric', month: 'long' })

        const key = `${year}-${month}`

        if (!groups[key]) {
          groups[key] = {
            year,
            month,
            monthName,
            races: [],
          }
        }

        // 既に登録されていなければ追加
        if (!groups[key].races.find((r) => r.id === race.id)) {
          groups[key].races.push(race)
        }
      })
    })

    return Object.values(groups).sort(
      (a, b) => new Date(a.year, a.month).getTime() - new Date(b.year, b.month).getTime()
    )
  }

  const handleDownloadCalendar = async () => {
    if (!calendarRef.current) return

    try {
      const png = await htmlToImage.toPng(calendarRef.current, {
        quality: 0.95,
        pixelRatio: 2,
      })

      const link = document.createElement('a')
      link.href = png
      link.download = `my-race-calendar-${new Date().toISOString().slice(0, 10)}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Failed to download calendar:', err)
      alert(isEn ? 'Failed to download calendar' : 'ダウンロードに失敗しました')
    }
  }

  const monthGroups = groupedRaces()

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            {isEn ? 'My Race Calendar' : 'マイレースカレンダー'}
          </h1>
          <p className="text-slate-600">
            {isEn
              ? 'Your confirmed races organized by month'
              : '行く確定したレースを月別に表示'}
          </p>
        </div>

        {/* ダウンロードボタン */}
        {monthGroups.length > 0 && (
          <div className="mb-6 flex justify-end">
            <Button
              onClick={handleDownloadCalendar}
              className="gap-2"
              variant="default"
            >
              <Download className="h-4 w-4" />
              {isEn ? 'Download as Image' : '画像としてダウンロード'}
            </Button>
          </div>
        )}

        {/* カレンダーコンテンツ */}
        <div ref={calendarRef} className="bg-white rounded-lg shadow-lg p-8">
          {loadingRaces ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton className="h-6 w-32 mb-4" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 font-semibold">{error}</p>
            </div>
          ) : monthGroups.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 mb-4">
                {isEn
                  ? 'No races marked as going yet'
                  : '行く確定したレースがありません'}
              </p>
              <p className="text-slate-400 text-sm">
                {isEn
                  ? 'Click "Going" on race details to add them here'
                  : 'レース詳細ページで「行く確定」をクリックして追加してください'}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {monthGroups.map((monthGroup) => (
                <div key={`${monthGroup.year}-${monthGroup.month}`}>
                  <h2 className="text-2xl font-bold text-slate-900 mb-4 pb-2 border-b-2 border-blue-200">
                    {monthGroup.monthName}
                  </h2>
                  <div className="space-y-3">
                    {monthGroup.races.map((race) => (
                      <Card
                        key={race.id}
                        className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow"
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-slate-900">
                                {isEn ? race.name_en : race.name}
                              </h3>
                              {race.events[0] && race.events[0].event_date && (
                                <>
                                  <div className="flex items-center gap-2 text-slate-600 mt-2">
                                    <Calendar className="h-4 w-4" />
                                    <span>
                                      {new Date(race.events[0].event_date as string).toLocaleDateString(
                                        isEn ? 'en-US' : 'ja-JP',
                                        {
                                          year: 'numeric',
                                          month: 'long',
                                          day: 'numeric',
                                        }
                                      )}
                                    </span>
                                  </div>
                                  {race.events[0].location && (
                                    <div className="flex items-center gap-2 text-slate-600 mt-1">
                                      <MapPin className="h-4 w-4" />
                                      <span>
                                        {isEn
                                          ? race.events[0].location_en || race.events[0].location
                                          : race.events[0].location}
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                            <SaveButton
                              categoryId={race.id}
                              isFavorite={false}
                              isGoing={isGoing(race.id)}
                              onToggle={toggle}
                              isEn={isEn}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
