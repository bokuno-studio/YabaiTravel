import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import EventDetail from './EventDetail'

// Supabase クライアントをモック（maybeSingle が 0 件でもエラーにならないことを検証）
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

function createEventsChain(res: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(res),
      }),
    }),
  }
}

function createCategoriesChain(res: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve(res),
      }),
    }),
  }
}

function renderEventDetail(eventId: string) {
  return render(
    <MemoryRouter initialEntries={[`/events/${eventId}`]}>
      <Routes>
        <Route path="/events/:eventId" element={<EventDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('EventDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'events') {
        return createEventsChain({ data: null, error: null }) as never
      }
      if (table === 'categories') {
        return createCategoriesChain({ data: [], error: null }) as never
      }
      return {} as never
    })
  })

  it('大会が存在しない場合（maybeSingle が null）に「大会が見つかりません」を表示する', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'events') {
        return createEventsChain({ data: null, error: null }) as never
      }
      if (table === 'categories') {
        return createCategoriesChain({ data: [], error: null }) as never
      }
      return {} as never
    })

    renderEventDetail('ev-123')

    await waitFor(() => {
      expect(screen.getByText('大会が見つかりません')).toBeInTheDocument()
    })
  })

  it('大会が存在する場合に大会名を表示する', async () => {
    const mockEvent = {
      id: 'ev-123',
      name: 'テスト大会2025',
      event_date: '2025-04-01',
      location: '東京',
    }
    // カテゴリが2つ以上ある場合のみ一覧表示（1つの場合は詳細へリダイレクト）
    const mockCategories = [
      { id: 'cat-1', name: '100km', event_id: 'ev-123' },
      { id: 'cat-2', name: '50km', event_id: 'ev-123' },
    ]

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'events') {
        return createEventsChain({ data: mockEvent, error: null }) as never
      }
      if (table === 'categories') {
        return createCategoriesChain({ data: mockCategories, error: null }) as never
      }
      return {} as never
    })

    renderEventDetail('ev-123')

    await waitFor(() => {
      expect(screen.getByText('テスト大会2025')).toBeInTheDocument()
    })
  })

  it('Supabase エラー時にエラーメッセージを表示する', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'events') {
        return createEventsChain({ data: null, error: { message: 'DB接続エラー' } }) as never
      }
      if (table === 'categories') {
        return createCategoriesChain({ data: [], error: null }) as never
      }
      return {} as never
    })

    renderEventDetail('ev-123')

    await waitFor(() => {
      expect(screen.getByText(/エラー:/)).toBeInTheDocument()
      expect(screen.getByText(/DB接続エラー/)).toBeInTheDocument()
    })
  })
})
