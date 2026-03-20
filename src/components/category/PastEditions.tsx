import { Card, CardContent } from '@/components/ui/card'
import type { Event, Category, CourseMapFile } from '@/types/event'
import SectionCard from './SectionCard'

interface PastEditionsProps {
  event: Event
  category: Category
  pastEditions: Array<{ event: Event; courseMaps: CourseMapFile[]; categories: Category[] }>
  isEn: boolean
  formatDate: (d: string | null) => string | null
}

function PastEditions({ event, category, pastEditions, isEn, formatDate }: PastEditionsProps) {
  return (
    <>
      {/* 去年のレース */}
      {event.previous_edition_url && (
        <SectionCard title={isEn ? 'Previous edition' : '去年のレース'}>
          <a
            href={event.previous_edition_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {isEn ? 'View previous edition' : '去年のレースはこちら'}
          </a>
        </SectionCard>
      )}

      {/* 過去の開催 */}
      {pastEditions.length > 0 && (
        <SectionCard title={isEn ? 'Past editions' : '過去の開催'}>
          <p className="mb-3 text-sm text-muted-foreground">{isEn ? 'Reference for past course maps, entry periods, and fees' : '去年のコースマップ・申込期間・料金の参考'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {pastEditions.map(({ event: pe, courseMaps, categories: pastCats }) => {
              const year = pe.event_date?.slice(0, 4)
              const sameCat = pastCats.find((c) => c.name === category?.name)
              return (
                <Card key={pe.id} className="bg-secondary/30 py-4">
                  <CardContent className="px-4">
                    <h3 className="mb-2 text-sm font-bold text-primary">{year}{isEn ? '' : '\u5E74'}</h3>
                    <dl className="grid grid-cols-[minmax(80px,1fr)_1fr] gap-x-4 gap-y-2 text-xs">
                      {pe.entry_start_typical && (
                        <>
                          <dt className="text-muted-foreground">{isEn ? 'Entry period' : '\u7533\u8FBC\u671F\u9593'}</dt>
                          <dd>{formatDate(pe.entry_start_typical)}\u301C{formatDate(pe.entry_end_typical)}</dd>
                        </>
                      )}
                      {sameCat?.entry_fee != null && (
                        <>
                          <dt className="text-muted-foreground">{sameCat.name} {isEn ? 'fee' : '\u7533\u8FBC\u8CBB'}</dt>
                          <dd>{sameCat.entry_fee.toLocaleString()} {sameCat.entry_fee_currency ?? (isEn ? 'JPY' : '\u5186')}</dd>
                        </>
                      )}
                      {courseMaps.length > 0 && (
                        <>
                          <dt className="text-muted-foreground">{isEn ? 'Course map' : '\u30B3\u30FC\u30B9\u30DE\u30C3\u30D7'}</dt>
                          <dd className="flex flex-wrap gap-2">
                            {courseMaps.map((cm) => (
                              <a key={cm.id} href={cm.file_path} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                {cm.display_name ?? `${cm.year}${isEn ? '' : '\u5E74'}`}
                              </a>
                            ))}
                          </dd>
                        </>
                      )}
                    </dl>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </SectionCard>
      )}
    </>
  )
}

export default PastEditions
