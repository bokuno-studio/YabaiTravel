import { Map } from 'lucide-react'
import type { Event, CourseMapFile } from '@/types/event'
import SectionCard from './SectionCard'

interface CourseMapProps {
  event: Event
  courseMapFiles: CourseMapFile[]
  isEn: boolean
}

function CourseMap({ event, courseMapFiles, isEn }: CourseMapProps) {
  return (
    <SectionCard title={isEn ? 'Course map' : 'コースマップはある？'} icon={<Map className="h-4 w-4 text-primary" />}>
      {courseMapFiles.length > 0 ? (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{isEn ? 'Stored on site' : 'サイト内保管'}</p>
          <ul className="space-y-1.5">
            {courseMapFiles.map((cm) => (
              <li key={cm.id}>
                <a
                  href={cm.file_path}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {cm.display_name ?? (cm.year ? (isEn ? `${cm.year} course` : `${cm.year}\u5E74\u30B3\u30FC\u30B9`) : (isEn ? 'Course map' : '\u30B3\u30FC\u30B9\u30DE\u30C3\u30D7'))}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{isEn ? 'Available even after the race' : '\u30EC\u30FC\u30B9\u7D42\u4E86\u5F8C\u3082\u53C2\u7167\u3067\u304D\u307E\u3059'}</p>
        </>
      ) : event.course_map_url ? (
        <>
          <p className="mb-1 text-sm text-muted-foreground">{isEn ? 'External link' : '\u5916\u90E8\u30EA\u30F3\u30AF'}</p>
          <a href={event.course_map_url} target="_blank" rel="noreferrer" className="break-all text-sm text-primary hover:underline">
            {event.course_map_url}
          </a>
        </>
      ) : (
        <p className="text-sm italic text-muted-foreground/60">{'\u2014'}</p>
      )}
    </SectionCard>
  )
}

export default CourseMap
