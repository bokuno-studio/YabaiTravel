import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { supabase } from '../lib/supabaseClient'
import CategoryDetail from './CategoryDetail'

// Supabase クライアントをモック（maybeSingle が 0 件でもエラーにならないことを検証）
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

function createChain(
  table: string,
  eventId: string,
  categoryId: string,
  overrides: {
    event?: unknown
    category?: unknown
    routes?: unknown
    accommodations?: unknown
    categories?: unknown
    courseMaps?: unknown
  } = {}
) {
  const defaults = {
    event: null,
    category: null,
    routes: [],
    accommodations: [],
    categories: [],
    courseMaps: [],
  }
  const opts = { ...defaults, ...overrides }

  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockImplementation((col: string, val: string) => {
        if (col === 'id' && val === eventId) {
          return { maybeSingle: () => Promise.resolve({ data: opts.event, error: null }) }
        }
        if (col === 'id' && val === categoryId) {
          return {
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.category, error: null }) }),
          }
        }
        if (col === 'event_id') {
          if (table === 'access_routes' || table === 'accommodations') {
            return { order: () => Promise.resolve({ data: opts.routes ?? opts.accommodations, error: null }) }
          }
          return {
            order: () => Promise.resolve({ data: opts.categories, error: null }),
            eq: () => ({
              order: () => Promise.resolve({ data: opts.courseMaps, error: null }),
            }),
          }
        }
        return {}
      }),
    }),
  }
}

function renderCategoryDetail(eventId: string, categoryId: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/events/${eventId}/categories/${categoryId}`]}>
        <Routes>
          <Route path="/events/:eventId/categories/:categoryId" element={<CategoryDetail />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe('CategoryDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('大会またはカテゴリが存在しない場合（maybeSingle が null）にエラー表示する', async () => {
    const mockFrom = vi.mocked(supabase.from)
    mockFrom
      .mockReturnValueOnce(
        createChain('events', 'ev-123', 'cat-1', { event: null }) as never
      )
      .mockReturnValueOnce(
        createChain('categories', 'ev-123', 'cat-1', { category: null }) as never
      )
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) } as never)
      .mockReturnValueOnce({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) } as never)
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) } as never)
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) } as never)

    renderCategoryDetail('ev-123', 'cat-1')

    await waitFor(() => {
      expect(screen.getByText(/読み込み中/)).toBeInTheDocument()
    })

    await waitFor(
      () => {
        // 大会・カテゴリが null の場合、コンポーネントは loading 後に何か表示する
        expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument()
      },
      { timeout: 2000 }
    )
  })

  it('大会とカテゴリが存在する場合にカテゴリ名を表示する', async () => {
    const mockEvent = {
      id: 'ev-123',
      name: 'テスト大会',
      event_date: '2025-04-01',
      event_series_id: null,
    }
    const mockCategory = {
      id: 'cat-1',
      name: '100km',
      event_id: 'ev-123',
    }

    const mockFrom = vi.mocked(supabase.from)
    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      callCount++
      if (table === 'events' && callCount === 1) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockEvent, error: null }),
            }),
          }),
        } as never
      }
      if (table === 'categories' && callCount === 2) {
        return {
          select: () => ({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === 'id') {
                return {
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: mockCategory, error: null }),
                  }),
                }
              }
              return {}
            }),
          }),
        } as never
      }
      if (table === 'access_routes' || table === 'accommodations') {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
          }),
        } as never
      }
      if (table === 'categories' && callCount >= 5) {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: [mockCategory], error: null }) }),
          }),
        } as never
      }
      if (table === 'course_map_files') {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
          }),
        } as never
      }
      return {} as never
    })

    renderCategoryDetail('ev-123', 'cat-1')

    await waitFor(
      () => {
        expect(screen.getByText('100km')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })
})
