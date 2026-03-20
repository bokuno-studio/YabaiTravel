import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

const GITHUB_TOKEN = process.env.GITHUB_TOKEN

interface GitHubIssue {
  state: string
  labels: Array<{ name: string }>
}

/**
 * Parse a GitHub Issue URL into owner, repo, and issue number.
 * Supports: https://github.com/{owner}/{repo}/issues/{number}
 */
function parseGitHubIssueUrl(url: string): { owner: string; repo: string; number: number } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) }
}

/**
 * Fetch a GitHub Issue and determine the feedback status.
 */
async function fetchIssueStatus(url: string): Promise<'in_progress' | 'resolved' | null> {
  const parsed = parseGitHubIssueUrl(url)
  if (!parsed) return null

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'yabai-travel-sync',
  }
  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`
  }

  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`
  const res = await fetchWithTimeout(apiUrl, { headers, timeout: 10000 })

  if (!res.ok) {
    console.error({ url, status: res.status }, 'GitHub API error')
    return null
  }

  const issue: GitHubIssue = await res.json()
  const labelNames = issue.labels.map((l) => l.name.toLowerCase())

  // Closed issue or "done" label → resolved
  if (issue.state === 'closed' || labelNames.includes('done')) {
    return 'resolved'
  }

  // "in-progress" label → in_progress
  if (labelNames.includes('in-progress')) {
    return 'in_progress'
  }

  // No matching label → keep current status
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Fetch all feedbacks with a linked GitHub Issue
    const { data: feedbacks, error } = await supabase
      .from('feedbacks')
      .select('id, github_issue_url, status')
      .not('github_issue_url', 'is', null)

    if (error) {
      console.error({ err: error }, 'Failed to fetch feedbacks')
      return res.status(500).json({ error: 'Internal server error' })
    }

    if (!feedbacks || feedbacks.length === 0) {
      return res.status(200).json({ message: 'No feedbacks with linked issues', updated: 0 })
    }

    let updated = 0
    const errors: string[] = []

    for (const fb of feedbacks) {
      try {
        const newStatus = await fetchIssueStatus(fb.github_issue_url!)
        if (newStatus && newStatus !== fb.status) {
          const { error: updateError } = await supabase
            .from('feedbacks')
            .update({ status: newStatus })
            .eq('id', fb.id)

          if (updateError) {
            errors.push(`Failed to update ${fb.id}: ${updateError.message}`)
          } else {
            updated++
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        errors.push(`Error processing ${fb.id}: ${msg}`)
      }
    }

    return res.status(200).json({
      message: `Processed ${feedbacks.length} feedbacks, updated ${updated}`,
      updated,
      total: feedbacks.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error({ err }, 'Unexpected error in sync-issue-status')
    return res.status(500).json({ error: 'Internal server error' })
  }
}
