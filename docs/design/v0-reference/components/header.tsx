'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface HeaderProps {
  locale: 'en' | 'ja'
  onLocaleChange: (locale: 'en' | 'ja') => void
}

export function Header({ locale, onLocaleChange }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex items-center">
            <span className="text-2xl font-bold tracking-tight text-primary">YABAI</span>
          </div>
        </Link>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-full border border-border bg-secondary/70 p-0.5">
            <button
              onClick={() => onLocaleChange('ja')}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                locale === 'ja'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              JA
            </button>
            <button
              onClick={() => onLocaleChange('en')}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                locale === 'en'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
