import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Legal from './Legal'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function renderLegal(lang = 'ja') {
  return render(
    <MemoryRouter initialEntries={[`/${lang}/legal`]}>
      <Routes>
        <Route path="/:lang/legal" element={<Legal />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Legal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'i-1' } }),
    })
  })

  it('renders legal notice title in Japanese', () => {
    renderLegal()
    expect(screen.getByText('特定商取引法に基づく表記')).toBeInTheDocument()
  })

  it('renders legal notice title in English', () => {
    renderLegal('en')
    expect(screen.getByText('Legal Notice (Specified Commercial Transactions Act)')).toBeInTheDocument()
  })

  it('renders legal rows', () => {
    renderLegal()
    expect(screen.getByText('販売業者')).toBeInTheDocument()
    expect(screen.getByText('flexplore')).toBeInTheDocument()
    expect(screen.getByText('代表者')).toBeInTheDocument()
    expect(screen.getByText('所在地')).toBeInTheDocument()
  })

  it('renders contact form', () => {
    renderLegal()
    expect(screen.getByText('お問い合わせ')).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
    expect(screen.getByLabelText('お問い合わせ内容')).toBeInTheDocument()
    expect(screen.getByText('送信')).toBeInTheDocument()
  })

  it('submits contact form successfully', async () => {
    renderLegal()

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByLabelText('お問い合わせ内容'), {
      target: { value: 'Hello, I have a question.' },
    })
    fireEvent.click(screen.getByText('送信'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', content: 'Hello, I have a question.' }),
      })
    })

    await waitFor(() => {
      expect(screen.getByText('お問い合わせを送信しました。ありがとうございます。')).toBeInTheDocument()
    })
  })

  it('shows error on failed submission', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' }),
    })

    renderLegal()

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByLabelText('お問い合わせ内容'), {
      target: { value: 'Hello' },
    })
    fireEvent.click(screen.getByText('送信'))

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('renders pricing link in legal notice', () => {
    renderLegal()
    const pricingLinks = screen.getAllByText('Pricing ページ')
    expect(pricingLinks.length).toBeGreaterThan(0)
  })
})
